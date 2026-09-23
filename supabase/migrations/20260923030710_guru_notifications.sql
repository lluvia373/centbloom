-- Applied to production through the reviewed deployment workflow on 2026-09-23.
create table public.guru_follows (
  user_id uuid not null references auth.users(id) on delete cascade,
  guru_id text not null check (guru_id ~ '^[a-z0-9-]{1,80}$'),
  followed_at timestamptz not null default now(),
  active boolean not null default true,
  primary key(user_id, guru_id)
);
create table public.notification_events (
  event_id text primary key check(length(event_id) between 1 and 200),
  kind text not null check(kind in ('guru_filing','guru_amendment','watch_change')),
  subject_id text not null check(length(subject_id) between 1 and 80),
  title text not null check(length(title) between 1 and 200),
  source_url text not null check(source_url ~ '^https://'),
  occurred_at timestamptz not null check(isfinite(occurred_at)),
  recorded_at timestamptz not null default clock_timestamp(),
  evidence jsonb not null check(jsonb_typeof(evidence) = 'object')
);
create index notification_events_subject on public.notification_events(kind, subject_id, recorded_at);
create table public.notification_visits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  baseline_at timestamptz not null,
  visited_at timestamptz not null
);
create table public.account_notifications (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id text not null references public.notification_events(event_id),
  delivered_at timestamptz not null default clock_timestamp(),
  read_at timestamptz,
  primary key(user_id,event_id)
);
create index account_notifications_recent on public.account_notifications(user_id, delivered_at desc, event_id);
create table public.notification_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  payload jsonb not null,
  response jsonb,
  primary key(user_id,request_id)
);
alter table public.guru_follows enable row level security;
alter table public.notification_events enable row level security;
alter table public.notification_visits enable row level security;
alter table public.account_notifications enable row level security;
alter table public.notification_receipts enable row level security;
create policy guru_follows_own on public.guru_follows for select to authenticated using((select auth.uid())=user_id);
create policy notifications_own on public.account_notifications for select to authenticated using((select auth.uid())=user_id);
create policy notification_visits_own on public.notification_visits for select to authenticated using((select auth.uid())=user_id);
create policy notification_receipts_own on public.notification_receipts for select to authenticated using((select auth.uid())=user_id);
create policy notification_events_delivered on public.notification_events for select to authenticated using(exists(select 1 from public.account_notifications n where n.user_id=(select auth.uid()) and n.event_id=notification_events.event_id));
revoke all on public.guru_follows,public.notification_events,public.notification_visits,public.account_notifications,public.notification_receipts from public,anon,authenticated;
grant select on public.guru_follows,public.notification_events,public.notification_visits,public.account_notifications,public.notification_receipts to authenticated;

-- Narrow definer functions are the only write surface. Never trust a client user_id or event.
create function public.set_guru_follow(p_request uuid,p_guru text,p_active boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); prior public.notification_receipts; payload jsonb:=jsonb_build_object('guru',p_guru,'active',p_active);
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_request is null or p_guru is null or p_active is null then raise exception 'Invalid follow'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,9141));
  select * into prior from public.notification_receipts where user_id=uid and request_id=p_request;
  if found then
    if prior.payload<>payload then raise exception 'Request ID reused'; end if;
    return (prior.response)::boolean;
  end if;
  insert into public.guru_follows(user_id,guru_id,active) values(uid,p_guru,p_active)
    on conflict(user_id,guru_id) do update set active=excluded.active,
      followed_at=case when not guru_follows.active and excluded.active then clock_timestamp() else guru_follows.followed_at end;
  insert into public.notification_receipts values(uid,p_request,payload,to_jsonb(p_active));
  return p_active;
end $$;

-- Trusted collector only. Same source event can be retried, but never silently mutated.
create function public.record_notification_event(p_event jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare old public.notification_events; moment timestamptz:=(p_event->>'occurred_at')::timestamptz;
begin
  if moment is null or not isfinite(moment) or moment>clock_timestamp() then raise exception 'Invalid event time'; end if;
  select * into old from public.notification_events where event_id=p_event->>'event_id';
  if found then
    if old.kind<>p_event->>'kind' or old.subject_id<>p_event->>'subject_id' or old.title<>p_event->>'title'
      or old.source_url<>p_event->>'source_url' or old.occurred_at<>moment or old.evidence<>p_event->'evidence'
      then raise exception 'Event identity conflict'; end if;
    return;
  end if;
  insert into public.notification_events(event_id,kind,subject_id,title,source_url,occurred_at,evidence)
    values(p_event->>'event_id',p_event->>'kind',p_event->>'subject_id',p_event->>'title',p_event->>'source_url',moment,p_event->'evidence');
end $$;

-- Internal helper: keep delivering unseen IDs even if an event arrived late. The initial
-- baseline never advances; last visit affects the presentation window, not data retention.
create function public.sync_account_notifications() returns void
language sql security definer set search_path='' as $$
  insert into public.account_notifications(user_id,event_id)
  select auth.uid(),e.event_id from public.notification_events e
  join public.notification_visits v on v.user_id=auth.uid()
  where e.recorded_at>v.baseline_at and e.occurred_at>v.baseline_at
    and ((e.kind in ('guru_filing','guru_amendment') and exists(select 1 from public.guru_follows f where f.user_id=auth.uid() and f.guru_id=e.subject_id and f.active and e.occurred_at>=f.followed_at))
      or (e.kind='watch_change' and exists(select 1 from public.watchlist_items w where w.user_id=auth.uid() and w.symbol=e.subject_id and w.deleted_at is null and e.occurred_at>=w.added_at)))
  on conflict(user_id,event_id) do nothing;
$$;
revoke all on function public.sync_account_notifications() from public,anon,authenticated;

create function public.visit_notifications(p_visit uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); previous public.notification_visits; prior public.notification_receipts; result jsonb; boundary timestamptz;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_visit is null then raise exception 'Visit ID required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,9141));
  select * into prior from public.notification_receipts where user_id=uid and request_id=p_visit;
  if found then
    if prior.payload<>'{"visit":true}'::jsonb then raise exception 'Request ID reused'; end if;
    perform public.sync_account_notifications();
    return prior.response;
  end if;
  select * into previous from public.notification_visits where user_id=uid;
  if found then
    perform public.sync_account_notifications();
  end if;
  boundary:=clock_timestamp();
  insert into public.notification_visits values(uid,boundary,boundary)
    on conflict(user_id) do update set visited_at=excluded.visited_at;
  result:=jsonb_build_object('since',previous.visited_at,'visitedAt',boundary);
  insert into public.notification_receipts values(uid,p_visit,'{"visit":true}',result);
  return result;
end $$;

create function public.read_notifications(p_before timestamptz default null,p_before_id text default null) returns jsonb
language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(item) order by item.delivered_at desc,item.event_id desc),'[]'::jsonb) from (
    select n.event_id,n.delivered_at,n.read_at,e.kind,e.subject_id,e.title,e.source_url,e.occurred_at
    from public.account_notifications n join public.notification_events e using(event_id)
    where n.user_id=auth.uid() and (p_before is null or (n.delivered_at,n.event_id)<(p_before,coalesce(p_before_id,'')))
    order by n.delivered_at desc,n.event_id desc limit 50
  ) item;
$$;
create function public.mark_notification_read(p_event text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  update public.account_notifications set read_at=coalesce(read_at,clock_timestamp()) where user_id=auth.uid() and event_id=p_event;
end $$;
revoke all on function public.set_guru_follow(uuid,text,boolean),public.record_notification_event(jsonb),public.visit_notifications(uuid),public.read_notifications(timestamptz,text),public.mark_notification_read(text) from public,anon,authenticated;
grant execute on function public.set_guru_follow(uuid,text,boolean),public.visit_notifications(uuid),public.read_notifications(timestamptz,text),public.mark_notification_read(text) to authenticated;
grant execute on function public.record_notification_event(jsonb) to service_role;
