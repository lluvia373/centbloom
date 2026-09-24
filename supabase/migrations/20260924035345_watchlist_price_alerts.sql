-- Account price conditions are opt-in. Existing target_price values are untouched.
create table public.watchlist_price_alerts (
  user_id uuid not null,
  symbol text not null,
  direction text not null check (direction in ('below','above')),
  threshold double precision not null check (threshold > 0 and threshold < 'Infinity'::double precision),
  currency text not null check (currency ~ '^([A-Z]{3}|GBp)$'),
  enabled boolean not null default false,
  revision uuid not null default gen_random_uuid(),
  configured_at timestamptz not null default clock_timestamp(),
  matched boolean,
  last_price double precision,
  last_quoted_at timestamptz,
  primary key(user_id,symbol,direction),
  foreign key(user_id,symbol) references public.watchlist_items(user_id,symbol) on delete cascade
);
alter table public.watchlist_price_alerts enable row level security;
create policy price_alerts_own on public.watchlist_price_alerts for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.watchlist_price_alerts from public,anon,authenticated;
grant select on public.watchlist_price_alerts to authenticated;
create index price_alerts_enabled on public.watchlist_price_alerts(user_id,symbol) where enabled;

create function public.read_price_alerts() returns jsonb
language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(a) order by a.symbol,a.direction),'[]'::jsonb)
  from public.watchlist_price_alerts a join public.watchlist_items w using(user_id,symbol)
  where a.user_id=auth.uid() and w.deleted_at is null;
$$;

create function public.set_price_alerts(p_request uuid,p_symbol text,p_rules jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); prior public.notification_receipts; rule jsonb;
  payload jsonb:=jsonb_build_object('price_symbol',p_symbol,'rules',p_rules);
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_request is null or p_symbol is null or jsonb_typeof(p_rules) is distinct from 'array'
    or jsonb_array_length(p_rules)>2 then raise exception 'Invalid price conditions'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,8394));
  select * into prior from public.notification_receipts where user_id=uid and request_id=p_request;
  if found then
    if prior.payload<>payload then raise exception 'Request ID reused'; end if;
    return public.read_price_alerts();
  end if;
  if not exists(select 1 from public.watchlist_items where user_id=uid and symbol=p_symbol and deleted_at is null)
    then raise exception 'watchlist_missing'; end if;
  if exists(select r->>'direction' from jsonb_array_elements(p_rules) r group by r->>'direction' having count(*)>1)
    then raise exception 'Duplicate price direction'; end if;
  for rule in select value from jsonb_array_elements(p_rules) loop
    if jsonb_typeof(rule) is distinct from 'object' or jsonb_typeof(rule->'enabled') is distinct from 'boolean'
      or jsonb_typeof(rule->'threshold') is distinct from 'number' then raise exception 'Invalid price condition'; end if;
    insert into public.watchlist_price_alerts(user_id,symbol,direction,threshold,currency,enabled)
      values(uid,p_symbol,rule->>'direction',(rule->>'threshold')::double precision,rule->>'currency',(rule->>'enabled')::boolean)
      on conflict(user_id,symbol,direction) do update set threshold=excluded.threshold,currency=excluded.currency,enabled=excluded.enabled,
        revision=gen_random_uuid(),configured_at=clock_timestamp(),matched=null,last_price=null,last_quoted_at=null
      where (watchlist_price_alerts.threshold,watchlist_price_alerts.currency,watchlist_price_alerts.enabled)
        is distinct from (excluded.threshold,excluded.currency,excluded.enabled);
  end loop;
  delete from public.watchlist_price_alerts a where a.user_id=uid and a.symbol=p_symbol
    and not exists(select 1 from jsonb_array_elements(p_rules) r where r->>'direction'=a.direction);
  insert into public.notification_receipts(user_id,request_id,payload,response) values(uid,p_request,payload,'null');
  return public.read_price_alerts();
end $$;

-- Removing a watch never silently re-subscribes its old conditions on a later Add.
create function public.disable_removed_price_alerts() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.deleted_at is not null then
    update public.watchlist_price_alerts set enabled=false,matched=null,last_quoted_at=null,last_price=null,
      revision=gen_random_uuid(),configured_at=clock_timestamp() where user_id=new.user_id and symbol=new.symbol;
  end if;
  return new;
end $$;
create trigger watchlist_disable_price_alerts after update of deleted_at on public.watchlist_items
  for each row execute function public.disable_removed_price_alerts();

alter table public.notification_events drop constraint notification_events_kind_check;
alter table public.notification_events add constraint notification_events_kind_check
  check(kind in ('guru_filing','guru_amendment','watch_change','watch_price'));

-- Only our authenticated server, never the browser, supplies observations. One
-- transaction locks state, crosses the boundary, writes event + own delivery.
create function public.evaluate_price_alerts(p_user uuid,p_quotes jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare rule public.watchlist_price_alerts; q jsonb; quote_at timestamptz; fetched_at timestamptz;
  price double precision; reached boolean; event_key text; emitted integer:=0; label text;
begin
  if p_user is null or jsonb_typeof(p_quotes) is distinct from 'array' or jsonb_array_length(p_quotes)>50
    then raise exception 'Invalid observations'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,8394));
  for q in select value from jsonb_array_elements(p_quotes) loop
    price:=(q->>'price')::double precision;
    quote_at:=(q->>'quotedAt')::timestamptz; fetched_at:=(q->>'fetchedAt')::timestamptz;
    -- Delayed quotes up to 20 minutes are allowed with their actual timestamp.
    -- Closed sessions and provider failures are not reinterpreted as new ticks.
    if price is null or not (price>0 and price<'Infinity'::double precision) or quote_at is null or fetched_at is null
      or not isfinite(quote_at) or not isfinite(fetched_at) or quote_at>clock_timestamp()
      or fetched_at>clock_timestamp() or quote_at<clock_timestamp()-interval '20 minutes'
      or fetched_at<clock_timestamp()-interval '2 minutes'
      or q->>'sourceUrl' is null or q->>'sourceUrl' !~ '^https://finance[.]yahoo[.]com/quote/' then continue; end if;
    for rule in select a.* from public.watchlist_price_alerts a join public.watchlist_items w using(user_id,symbol)
      where a.user_id=p_user and a.symbol=q->>'symbol' and a.enabled and w.deleted_at is null
        and a.currency=q->>'currency' order by a.direction for update of a loop
      if quote_at<rule.configured_at or (rule.last_quoted_at is not null and quote_at<=rule.last_quoted_at) then continue; end if;
      reached:=case when rule.direction='below' then price<=rule.threshold else price>=rule.threshold end;
      if rule.matched=false and reached and quote_at>rule.configured_at then
        event_key:='price:'||md5(p_user::text||':'||rule.symbol||':'||rule.direction||':'||rule.revision::text||':'||quote_at::text);
        select name into label from public.watchlist_items where user_id=p_user and symbol=rule.symbol;
        insert into public.notification_events(event_id,kind,subject_id,title,source_url,occurred_at,evidence)
          values(event_key,'watch_price',rule.symbol,left(label||' · '||rule.threshold::text||' '||rule.currency||
            case when rule.direction='below' then ' 이하 도달' else ' 이상 도달' end,200),q->>'sourceUrl',quote_at,
            jsonb_build_object('direction',rule.direction,'threshold',rule.threshold,'currency',rule.currency,'price',price,'quotedAt',quote_at))
          on conflict(event_id) do nothing;
        insert into public.account_notifications(user_id,event_id) values(p_user,event_key) on conflict(user_id,event_id) do nothing;
        emitted:=emitted+1;
      end if;
      update public.watchlist_price_alerts set matched=reached,last_price=price,last_quoted_at=quote_at
        where user_id=p_user and symbol=rule.symbol and direction=rule.direction;
    end loop;
  end loop;
  return emitted;
end $$;
revoke all on function public.read_price_alerts(),public.set_price_alerts(uuid,text,jsonb),
  public.disable_removed_price_alerts(),public.evaluate_price_alerts(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.read_price_alerts(),public.set_price_alerts(uuid,text,jsonb) to authenticated;
grant execute on function public.evaluate_price_alerts(uuid,jsonb) to service_role;
