-- Apply as one migration transaction. Keep the recovery copy inside this database.
-- The private schema is not an exposed Data API schema; clients have no access.
set local lock_timeout = '10s';
lock table public.portfolio_transactions, public.portfolio_preferences, public.portfolio_snapshots in access exclusive mode;
create schema centifolio_release_backup;
revoke all on schema centifolio_release_backup from public, anon, authenticated, service_role;
create table centifolio_release_backup.portfolio_transactions as table public.portfolio_transactions;
create table centifolio_release_backup.portfolio_preferences as table public.portfolio_preferences;
create table centifolio_release_backup.portfolio_snapshots as table public.portfolio_snapshots;
revoke all on all tables in schema centifolio_release_backup from public, anon, authenticated, service_role;
alter table centifolio_release_backup.portfolio_transactions enable row level security;
alter table centifolio_release_backup.portfolio_preferences enable row level security;
alter table centifolio_release_backup.portfolio_snapshots enable row level security;
comment on schema centifolio_release_backup is 'Pre atomic-ledger release recovery copy; admin only. Retain until release verification and deliberate cleanup.';

-- Persist stable order for trades sharing a date/created_at (the client uses stable sorting).
alter table public.portfolio_transactions add column ledger_position bigint check (ledger_position >= 0);
with positions as (select id,row_number() over (partition by user_id order by trade_date,created_at,id)-1 position from public.portfolio_transactions)
update public.portfolio_transactions t set ledger_position=p.position from positions p where t.id=p.id;
create table public.portfolio_commit_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  payload_hash text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);
alter table public.portfolio_commit_receipts enable row level security;
create policy own_receipts on public.portfolio_commit_receipts for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert on public.portfolio_commit_receipts to authenticated;

create function public.read_portfolio_ledger() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('revision', md5(records::text), 'transactions', records)
  from (select coalesce(jsonb_agg(to_jsonb(t) order by t.trade_date,t.created_at,t.ledger_position nulls last,t.id), '[]'::jsonb) records
        from public.portfolio_transactions t where t.user_id = auth.uid()) snapshot;
$$;

-- Existing clients and direct table DML use the same per-account lock.
create function public.lock_portfolio_ledger() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 8371));
  return null;
end;
$$;
create trigger portfolio_ledger_lock before insert or update or delete
  on public.portfolio_transactions for each statement execute function public.lock_portfolio_ledger();

create function public.commit_portfolio_ledger(expected_revision text, request_id uuid, next_transactions jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  existing_hash text;
  payload_hash text := md5(next_transactions::text);
  snapshot jsonb;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 8371));
  select r.payload_hash into existing_hash from public.portfolio_commit_receipts r
    where r.user_id = owner_id and r.request_id = commit_portfolio_ledger.request_id;
  if existing_hash is not null then
    if existing_hash <> payload_hash then raise exception 'Request ID reused with different content'; end if;
    return public.read_portfolio_ledger();
  end if;
  snapshot := public.read_portfolio_ledger();
  if snapshot->>'revision' is distinct from expected_revision then
    raise exception 'Portfolio changed; reload before retrying' using errcode = '40001';
  end if;
  if jsonb_typeof(next_transactions) is distinct from 'array' then raise exception 'Expected transaction array'; end if;
  if exists(select 1 from jsonb_populate_recordset(null::public.portfolio_transactions, next_transactions) t
    where t.user_id is distinct from owner_id or t.id is null or t.symbol is null or t.name is null
      or t.trade_date is null or t.created_at is null or t.transaction_type not in ('buy','sell')
      or t.transaction_type is null or t.quantity is null or t.price is null or t.fee is null
      or t.quantity <= 0 or t.price <= 0 or t.fee < 0
      or t.quantity::text in ('NaN','Infinity','-Infinity') or t.price::text in ('NaN','Infinity','-Infinity')
      or t.fee::text in ('NaN','Infinity','-Infinity')
      or t.fx_rate_to_krw <= 0 or t.usd_krw_rate_at_transaction <= 0
      or t.fx_rate_to_krw::text in ('NaN','Infinity','-Infinity')
      or t.usd_krw_rate_at_transaction::text in ('NaN','Infinity','-Infinity')) then raise exception 'Invalid transaction'; end if;
  if exists(select id from jsonb_populate_recordset(null::public.portfolio_transactions, next_transactions)
    group by id having count(*) > 1) then raise exception 'Duplicate transaction ID'; end if;
  if exists(select 1 from (
    select sum(case when t.transaction_type = 'buy' then t.quantity else -t.quantity end)
      over (partition by t.symbol order by t.trade_date, t.created_at, ordinal rows unbounded preceding) quantity
    from jsonb_array_elements(next_transactions) with ordinality as e(value, ordinal)
    cross join lateral jsonb_populate_record(null::public.portfolio_transactions, e.value) t
  ) positions where quantity < -0.00000001) then raise exception 'Sale exceeds holdings'; end if;
  select coalesce(jsonb_agg(value || jsonb_build_object('ledger_position',ordinal-1) order by ordinal),'[]'::jsonb)
    into next_transactions from jsonb_array_elements(next_transactions) with ordinality e(value,ordinal);
  -- An ID owned by another account cannot be silently overwritten or skipped.
  insert into public.portfolio_transactions as existing
    select * from jsonb_populate_recordset(null::public.portfolio_transactions, next_transactions)
    on conflict (id) do update set
      symbol=excluded.symbol, name=excluded.name, transaction_type=excluded.transaction_type,
      trade_date=excluded.trade_date, quantity=excluded.quantity, price=excluded.price, fee=excluded.fee,
      currency=excluded.currency, fx_rate_to_krw=excluded.fx_rate_to_krw,
      usd_krw_rate_at_transaction=excluded.usd_krw_rate_at_transaction, created_at=excluded.created_at, ledger_position=excluded.ledger_position
      where to_jsonb(existing) is distinct from to_jsonb(excluded);
  delete from public.portfolio_transactions t where t.user_id=owner_id
    and not exists(select 1 from jsonb_array_elements(next_transactions) e where (e->>'id')::uuid=t.id);
  insert into public.portfolio_commit_receipts(user_id, request_id, payload_hash)
    values(owner_id, request_id, payload_hash);
  return public.read_portfolio_ledger();
end;
$$;
revoke all on function public.read_portfolio_ledger() from public, anon;
revoke all on function public.commit_portfolio_ledger(text, uuid, jsonb) from public, anon;
revoke all on function public.lock_portfolio_ledger() from public, anon;
grant execute on function public.read_portfolio_ledger(), public.commit_portfolio_ledger(text, uuid, jsonb), public.lock_portfolio_ledger() to authenticated;

alter table public.portfolio_snapshots add column ledger_revision text;
create function public.save_portfolio_performance(expected_revision text, started_at timestamptz, points jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid := auth.uid();
begin
  if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,8371));
  if public.read_portfolio_ledger()->>'revision' is distinct from expected_revision then
    raise exception 'Transactions changed during calculation' using errcode='40001';
  end if;
  insert into public.portfolio_preferences(user_id,portfolio_started_at) values(owner_id,started_at)
    on conflict(user_id) do update set portfolio_started_at=coalesce(public.portfolio_preferences.portfolio_started_at,excluded.portfolio_started_at);
  delete from public.portfolio_snapshots where user_id=owner_id and ledger_revision is distinct from expected_revision;
  insert into public.portfolio_snapshots(user_id,snapshot_date,cutoff_at,portfolio_started_at,total_assets_krw,investment_assets_krw,cash_assets_krw,twr_index,net_flow_krw,cumulative_net_flow_krw,cumulative_profit_krw,is_active,is_final,valuation_method,ledger_revision)
  select owner_id,p.date::date,p."cutoffAt"::timestamptz,started_at,p."assetValueKRW",p."assetValueKRW",0,p."twrIndex",p."netFlowKRW",p."cumulativeNetFlowKRW",p."cumulativeProfitKRW",p.active,p.final,'reconstructed_daily_close',expected_revision
    from jsonb_to_recordset(points) as p(date text,"cutoffAt" text,"assetValueKRW" numeric,"twrIndex" numeric,"netFlowKRW" numeric,"cumulativeNetFlowKRW" numeric,"cumulativeProfitKRW" numeric,active boolean,final boolean)
    on conflict(user_id,snapshot_date) do update set cutoff_at=excluded.cutoff_at,captured_at=now(),total_assets_krw=excluded.total_assets_krw,investment_assets_krw=excluded.investment_assets_krw,twr_index=excluded.twr_index,net_flow_krw=excluded.net_flow_krw,cumulative_net_flow_krw=excluded.cumulative_net_flow_krw,cumulative_profit_krw=excluded.cumulative_profit_krw,is_active=excluded.is_active,is_final=excluded.is_final,ledger_revision=excluded.ledger_revision,updated_at=now();
end;
$$;
revoke all on function public.save_portfolio_performance(text,timestamptz,jsonb) from public,anon;
grant execute on function public.save_portfolio_performance(text,timestamptz,jsonb) to authenticated;

