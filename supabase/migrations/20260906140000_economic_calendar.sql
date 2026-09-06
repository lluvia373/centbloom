-- New public economic data only; never touches user portfolio records.
begin;
create table public.economic_releases (
 id text primary key,
 series_key text not null,
 release_at timestamptz not null,
 source_updated_at timestamptz not null,
 payload jsonb not null check (jsonb_typeof(payload) = 'object'),
 received_at timestamptz not null default now()
);
create index economic_releases_month on public.economic_releases(release_at);
create index economic_releases_series on public.economic_releases(series_key, release_at desc);
create table public.economic_release_versions (
 release_id text not null references public.economic_releases(id),
 source_updated_at timestamptz not null,
 fingerprint text not null,
 payload jsonb not null,
 received_at timestamptz not null default now(),
 primary key(release_id,source_updated_at,fingerprint)
);
alter table public.economic_releases enable row level security;
alter table public.economic_release_versions enable row level security;
revoke all on public.economic_releases,public.economic_release_versions from public,anon,authenticated;
grant select on public.economic_releases to anon,authenticated;
create policy economic_read on public.economic_releases for select to anon,authenticated using(true);
grant select,insert,update on public.economic_releases to service_role;
grant select,insert on public.economic_release_versions to service_role;
-- service_role bypasses RLS on Supabase; explicit policies also support isolated verification.
create policy economic_ingest on public.economic_releases for all to service_role using(true) with check(true);
create policy economic_version_ingest on public.economic_release_versions for all to service_role using(true) with check(true);

create function public.ingest_economic_releases(items jsonb) returns integer
language plpgsql security invoker set search_path = '' as $$
declare item jsonb; current_row public.economic_releases; merged jsonb; total integer := 0;
begin
 if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 2000 then
   raise exception 'Invalid release batch';
 end if;
 -- Deterministic lock order prevents overlap from deadlocking. One transaction per batch.
 for item in select value from jsonb_array_elements(items) order by value->>'id',value->>'updatedAt'
 loop
   if coalesce(item->>'id','') !~ '^te:[A-Za-z0-9_-]+$'
     or coalesce(item->>'seriesKey','') not like 'te:US:%'
     or nullif(item->>'title','') is null
     or nullif(item->>'at','') is null
     or nullif(item->>'updatedAt','') is null
     or (item->'actual' is not null and jsonb_typeof(item->'actual') not in ('null','string'))
     or (item->'forecast' is not null and jsonb_typeof(item->'forecast') not in ('null','string'))
   then raise exception 'Invalid release'; end if;
   insert into public.economic_releases(id,series_key,release_at,source_updated_at,payload)
     values(item->>'id',item->>'seriesKey',(item->>'at')::timestamptz,(item->>'updatedAt')::timestamptz,item)
     on conflict(id) do nothing;
   select * into current_row from public.economic_releases where id=item->>'id' for update;
   if current_row.series_key <> item->>'seriesKey' then raise exception 'Release identity changed'; end if;
   insert into public.economic_release_versions(release_id,source_updated_at,fingerprint,payload)
     values(item->>'id',(item->>'updatedAt')::timestamptz,md5(item::text),item) on conflict do nothing;
   if (item->>'updatedAt')::timestamptz > current_row.source_updated_at then
     -- Missing fields in a later response cannot erase an already received result.
     merged := item || jsonb_build_object(
       'actual',coalesce(nullif(item->'actual','null'::jsonb),current_row.payload->'actual'),
       'forecast',coalesce(nullif(item->'forecast','null'::jsonb),current_row.payload->'forecast'),
       'previous',coalesce(nullif(item->'previous','null'::jsonb),current_row.payload->'previous'),
       'previousOriginal',coalesce(nullif(item->'previousOriginal','null'::jsonb),current_row.payload->'previousOriginal'));
     update public.economic_releases set release_at=(item->>'at')::timestamptz,
       payload=merged, source_updated_at=(item->>'updatedAt')::timestamptz,received_at=now()
       where id=item->>'id';
   end if;
   total := total + 1;
 end loop;
 return total;
end $$;
revoke all on function public.ingest_economic_releases(jsonb) from public,anon,authenticated;
grant execute on function public.ingest_economic_releases(jsonb) to service_role;
commit;
