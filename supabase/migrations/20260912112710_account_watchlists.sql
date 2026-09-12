-- Account watchlists: row mutations, retained deletion markers and import/write receipts.
set local lock_timeout = '10s';

create table public.watchlist_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null check (symbol ~ '^[A-Za-z0-9.^=_-]{1,40}$'),
  name text not null check (length(btrim(name)) between 1 and 200),
  target_price double precision check (target_price > 0 and target_price < 'Infinity'::double precision),
  target_currency text check (target_currency ~ '^([A-Z]{3}|GBp)$'),
  added_at timestamptz not null default now() check (isfinite(added_at)),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, symbol),
  check (target_price is null or target_currency is not null)
);
create table public.watchlist_write_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  payload_hash text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);
alter table public.watchlist_items enable row level security;
alter table public.watchlist_write_receipts enable row level security;
create policy watchlist_select_own on public.watchlist_items for select to authenticated
  using ((select auth.uid()) = user_id);
create policy watchlist_insert_own on public.watchlist_items for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy watchlist_update_own on public.watchlist_items for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy watchlist_receipts_select_own on public.watchlist_write_receipts for select to authenticated
  using ((select auth.uid()) = user_id);
create policy watchlist_receipts_insert_own on public.watchlist_write_receipts for insert to authenticated
  with check ((select auth.uid()) = user_id);
revoke all on public.watchlist_items, public.watchlist_write_receipts from public, anon, authenticated;
grant select, insert on public.watchlist_items to authenticated;
grant update (name, target_price, target_currency, added_at, updated_at, deleted_at) on public.watchlist_items to authenticated;
grant select, insert on public.watchlist_write_receipts to authenticated;

-- Direct account DML and RPC share the lock and the same cap. No client DELETE grant:
-- tombstones must survive old-device imports even after the active list is empty.
create function public.lock_watchlist() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 8394));
  return null;
end;
$$;
create trigger watchlist_account_lock before insert or update on public.watchlist_items
  for each statement execute function public.lock_watchlist();

create function public.validate_watchlist_row() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.user_id is distinct from auth.uid() then raise exception 'Account mismatch' using errcode = '42501'; end if;
  if new.deleted_at is null and not exists (
    select 1 from public.watchlist_items w where w.user_id = new.user_id and w.symbol = new.symbol and w.deleted_at is null
  ) and (select count(*) from public.watchlist_items w where w.user_id = new.user_id and w.deleted_at is null) >= 50 then
    raise exception 'watchlist_limit' using errcode = '23514';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
create trigger watchlist_validate_row before insert or update on public.watchlist_items
  for each row execute function public.validate_watchlist_row();

create function public.read_watchlist() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'symbol', w.symbol, 'name', w.name, 'target_price', w.target_price,
    'target_currency', w.target_currency, 'added_at', w.added_at
  ) order by w.added_at, w.symbol), '[]'::jsonb)
  from public.watchlist_items w where w.user_id = auth.uid() and w.deleted_at is null;
$$;

create function public.commit_watchlist(request_id uuid, operation text, payload jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  existing_hash text;
  content_hash text := md5(coalesce(operation, '') || ':' || coalesce(payload::text, ''));
  entry jsonb;
  stock_symbol text;
  stock_name text;
  stock_target double precision;
  stock_currency text;
  stock_added timestamptz;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if request_id is null then raise exception 'Request ID required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 8394));
  select r.payload_hash into existing_hash from public.watchlist_write_receipts r
    where r.user_id = owner_id and r.request_id = commit_watchlist.request_id;
  if existing_hash is not null then
    if existing_hash <> content_hash then raise exception 'Request ID reused with different content'; end if;
    return public.read_watchlist();
  end if;
  if operation = 'import' then
    if jsonb_typeof(payload) is distinct from 'array' or jsonb_array_length(payload) > 50 then raise exception 'Invalid watchlist import'; end if;
    if exists (select e->>'symbol' from jsonb_array_elements(payload) e group by e->>'symbol' having count(*) > 1) then raise exception 'Duplicate import symbol'; end if;
    for entry in select value from jsonb_array_elements(payload) loop
      if jsonb_typeof(entry) is distinct from 'object' then raise exception 'Invalid watchlist item'; end if;
      stock_symbol := entry->>'symbol';
      stock_name := entry->>'name';
      stock_target := (entry->>'targetPrice')::double precision;
      stock_currency := entry->>'targetCurrency';
      stock_added := (entry->>'addedAt')::timestamptz;
      if stock_symbol is null or stock_name is null or stock_added is null then raise exception 'Invalid watchlist item'; end if;
      -- An existing active item or tombstone always wins over a legacy device copy.
      -- Skip before INSERT so an ignored conflict does not consume a capacity slot.
      if not exists (select 1 from public.watchlist_items w where w.user_id = owner_id and w.symbol = stock_symbol) then
        insert into public.watchlist_items(user_id, symbol, name, target_price, target_currency, added_at)
          values(owner_id, stock_symbol, stock_name, stock_target, stock_currency, stock_added)
          on conflict (user_id, symbol) do nothing;
      end if;
    end loop;
  elsif operation in ('add', 'remove', 'target') then
    if jsonb_typeof(payload) is distinct from 'object' then raise exception 'Invalid watchlist item'; end if;
    stock_symbol := payload->>'symbol';
    if stock_symbol is null or stock_symbol !~ '^[A-Za-z0-9.^=_-]{1,40}$' then raise exception 'Invalid watchlist symbol'; end if;
    if operation = 'remove' then
      insert into public.watchlist_items(user_id, symbol, name, deleted_at)
        values(owner_id, stock_symbol, stock_symbol, clock_timestamp())
        on conflict (user_id, symbol) do update set deleted_at = excluded.deleted_at;
    elsif operation = 'target' then
      if not (payload ? 'targetPrice') then raise exception 'Target price required'; end if;
      stock_target := (payload->>'targetPrice')::double precision;
      stock_currency := case when stock_target is null then null else payload->>'targetCurrency' end;
      update public.watchlist_items w set target_price = stock_target, target_currency = stock_currency
        where w.user_id = owner_id and w.symbol = stock_symbol and w.deleted_at is null;
      if not found then raise exception 'watchlist_missing' using errcode = 'P0002'; end if;
    else
      stock_name := payload->>'name';
      stock_added := (payload->>'addedAt')::timestamptz;
      if stock_name is null or stock_added is null then raise exception 'Invalid watchlist item'; end if;
      -- An explicit Add may restore a deletion. Duplicate Add preserves existing targets.
      if not exists (select 1 from public.watchlist_items w where w.user_id = owner_id and w.symbol = stock_symbol and w.deleted_at is null) then
        insert into public.watchlist_items(user_id, symbol, name, added_at)
          values(owner_id, stock_symbol, stock_name, stock_added)
          on conflict (user_id, symbol) do update set name = excluded.name, added_at = excluded.added_at,
            target_price = null, target_currency = null, deleted_at = null;
      end if;
    end if;
  else raise exception 'Invalid watchlist operation';
  end if;
  insert into public.watchlist_write_receipts(user_id, request_id, payload_hash)
    values(owner_id, request_id, content_hash);
  return public.read_watchlist();
end;
$$;

revoke all on function public.lock_watchlist(), public.validate_watchlist_row(), public.read_watchlist(), public.commit_watchlist(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.lock_watchlist(), public.validate_watchlist_row(), public.read_watchlist(), public.commit_watchlist(uuid, text, jsonb) to authenticated;
comment on table public.watchlist_items is 'Account-owned watchlist. deleted_at rows are retained to prevent resurrection from legacy device imports.';
comment on table public.watchlist_write_receipts is 'Account-scoped idempotent watchlist writes and deterministic legacy import receipts.';

