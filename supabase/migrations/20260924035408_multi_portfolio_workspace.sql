-- One account lock / one transaction protects portfolio metadata and the ledger.
-- Existing trade IDs, values and ordering are retained; no synthetic transactions.
set local lock_timeout = '10s';
lock table public.portfolio_transactions in access exclusive mode;
create table public.portfolios (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 40),
  created_at timestamptz not null default now(),
  is_default boolean not null default false,
  primary key (user_id, id)
);
create unique index portfolios_one_default on public.portfolios(user_id) where is_default;
alter table public.portfolios enable row level security;
revoke all on public.portfolios from public, anon, authenticated;
grant select, insert, update, delete on public.portfolios to authenticated;
create policy own_portfolios on public.portfolios for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

insert into public.portfolios(user_id,id,name,is_default)
select distinct user_id,'00000000-0000-4000-8000-000000000001'::uuid,'기본 포트폴리오',true
from public.portfolio_transactions;
alter table public.portfolio_transactions add column portfolio_id uuid;
alter table public.portfolio_transactions add column cost_basis_path uuid[] not null default '{}' check (cardinality(cost_basis_path)<=100);
alter table public.portfolio_transactions disable trigger portfolio_ledger_lock;
update public.portfolio_transactions set portfolio_id='00000000-0000-4000-8000-000000000001' where portfolio_id is null;
alter table public.portfolio_transactions enable trigger portfolio_ledger_lock;
alter table public.portfolio_transactions alter column portfolio_id set not null;
alter table public.portfolio_transactions add constraint transaction_portfolio_owner
  foreign key(user_id,portfolio_id) references public.portfolios(user_id,id) on delete restrict;
create index portfolio_transactions_scope on public.portfolio_transactions(user_id,portfolio_id,trade_date);
create trigger portfolios_ledger_lock before insert or update or delete on public.portfolios
  for each statement execute function public.lock_portfolio_ledger();

create or replace function public.read_portfolio_ledger() returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare owner_id uuid:=auth.uid(); records jsonb; folders jsonb;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not exists(select 1 from public.portfolios where user_id=owner_id) then
    insert into public.portfolios(user_id,id,name,is_default)
      values(owner_id,'00000000-0000-4000-8000-000000000001','기본 포트폴리오',true)
      on conflict(user_id,id) do nothing;
  end if;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.trade_date,t.created_at,t.ledger_position nulls last,t.id),'[]'::jsonb)
    into records from public.portfolio_transactions t where t.user_id=owner_id;
  select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at,p.id),'[]'::jsonb)
    into folders from public.portfolios p where p.user_id=owner_id;
  return jsonb_build_object('revision',md5(jsonb_build_array(folders,records)::text),'transactions',records,'portfolios',folders);
end;
$$;

-- Retain the legacy RPC but enforce portfolio membership and per-portfolio sell validation.
-- New clients use the metadata + ledger RPC below.
create or replace function public.commit_portfolio_ledger(expected_revision text, request_id uuid, next_transactions jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare owner_id uuid:=auth.uid(); existing_hash text; payload_hash text:=md5(next_transactions::text); snapshot jsonb;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,8371));
  select r.payload_hash into existing_hash from public.portfolio_commit_receipts r where r.user_id=owner_id and r.request_id=commit_portfolio_ledger.request_id;
  if existing_hash is not null then
    if existing_hash<>payload_hash then raise exception 'Request ID reused with different content'; end if;
    return public.read_portfolio_ledger();
  end if;
  snapshot:=public.read_portfolio_ledger();
  if snapshot->>'revision' is distinct from expected_revision then raise exception 'Portfolio changed; reload before retrying' using errcode='40001'; end if;
  if jsonb_typeof(next_transactions) is distinct from 'array' then raise exception 'Expected transaction array'; end if;
  if exists(select 1 from jsonb_populate_recordset(null::public.portfolio_transactions,next_transactions) t
    where t.user_id is distinct from owner_id or t.id is null or t.symbol is null or t.name is null
      or t.trade_date is null or t.created_at is null or t.transaction_type not in ('buy','sell') or t.transaction_type is null
      or t.quantity is null or t.price is null or t.fee is null or t.quantity<=0 or t.price<=0 or t.fee<0
      or t.portfolio_id is null or not exists(select 1 from public.portfolios p where p.user_id=owner_id and p.id=t.portfolio_id)
      or t.cost_basis_path is null or cardinality(t.cost_basis_path)>100
      or t.quantity::text in ('NaN','Infinity','-Infinity') or t.price::text in ('NaN','Infinity','-Infinity') or t.fee::text in ('NaN','Infinity','-Infinity')
      or t.fx_rate_to_krw<=0 or t.usd_krw_rate_at_transaction<=0
      or t.fx_rate_to_krw::text in ('NaN','Infinity','-Infinity') or t.usd_krw_rate_at_transaction::text in ('NaN','Infinity','-Infinity')) then raise exception 'Invalid transaction'; end if;
  if exists(select id from jsonb_populate_recordset(null::public.portfolio_transactions,next_transactions) group by id having count(*)>1) then raise exception 'Duplicate transaction ID'; end if;
  if exists(select 1 from (
    select sum(case when t.transaction_type='buy' then t.quantity else -t.quantity end)
      over(partition by t.portfolio_id,t.symbol order by t.trade_date,t.created_at,ordinal rows unbounded preceding) quantity
    from jsonb_array_elements(next_transactions) with ordinality e(value,ordinal)
    cross join lateral jsonb_populate_record(null::public.portfolio_transactions,e.value) t
  ) positions where quantity < -0.00000001) then raise exception 'Sale exceeds portfolio holdings'; end if;
  select coalesce(jsonb_agg(value||jsonb_build_object('ledger_position',ordinal-1) order by ordinal),'[]'::jsonb)
    into next_transactions from jsonb_array_elements(next_transactions) with ordinality e(value,ordinal);
  insert into public.portfolio_transactions as existing
    select * from jsonb_populate_recordset(null::public.portfolio_transactions,next_transactions)
    on conflict(id) do update set symbol=excluded.symbol,name=excluded.name,transaction_type=excluded.transaction_type,
      trade_date=excluded.trade_date,quantity=excluded.quantity,price=excluded.price,fee=excluded.fee,currency=excluded.currency,
      fx_rate_to_krw=excluded.fx_rate_to_krw,usd_krw_rate_at_transaction=excluded.usd_krw_rate_at_transaction,
      created_at=excluded.created_at,ledger_position=excluded.ledger_position,portfolio_id=excluded.portfolio_id,cost_basis_path=excluded.cost_basis_path
      where to_jsonb(existing) is distinct from to_jsonb(excluded);
  delete from public.portfolio_transactions t where t.user_id=owner_id
    and not exists(select 1 from jsonb_array_elements(next_transactions) e where (e->>'id')::uuid=t.id);
  insert into public.portfolio_commit_receipts(user_id,request_id,payload_hash) values(owner_id,request_id,payload_hash);
  return public.read_portfolio_ledger();
end;
$$;

create table public.portfolio_workspace_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null, payload_hash text not null, created_at timestamptz not null default now(),
  primary key(user_id,request_id)
);
alter table public.portfolio_workspace_receipts enable row level security;
revoke all on public.portfolio_workspace_receipts from public,anon,authenticated;
grant select,insert on public.portfolio_workspace_receipts to authenticated;
create policy own_workspace_receipts on public.portfolio_workspace_receipts for all to authenticated
  using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

create function public.commit_portfolio_workspace(expected_revision text,request_id uuid,next_portfolios jsonb,next_transactions jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare owner_id uuid:=auth.uid(); existing_hash text; payload_hash text:=md5(jsonb_build_array(next_portfolios,next_transactions)::text); snapshot jsonb;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,8371));
  select r.payload_hash into existing_hash from public.portfolio_workspace_receipts r where r.user_id=owner_id and r.request_id=commit_portfolio_workspace.request_id;
  if existing_hash is not null then
    if existing_hash<>payload_hash then raise exception 'Request ID reused with different content'; end if;
    return public.read_portfolio_ledger();
  end if;
  snapshot:=public.read_portfolio_ledger();
  if snapshot->>'revision' is distinct from expected_revision then raise exception 'Portfolio changed; reload before retrying' using errcode='40001'; end if;
  if jsonb_typeof(next_portfolios) is distinct from 'array' or jsonb_array_length(next_portfolios) not between 1 and 100 then raise exception 'Expected 1 to 100 portfolios'; end if;
  if exists(select 1 from jsonb_populate_recordset(null::public.portfolios,next_portfolios) p where p.user_id is distinct from owner_id or p.id is null or p.name is null or length(btrim(p.name)) not between 1 and 40 or p.created_at is null or p.is_default is null)
    or exists(select id from jsonb_populate_recordset(null::public.portfolios,next_portfolios) group by id having count(*)>1)
    or (select count(*) from jsonb_populate_recordset(null::public.portfolios,next_portfolios) p where p.is_default)<>1 then raise exception 'Invalid portfolios'; end if;
  -- Clear the old default before setting a new one (partial unique index).
  update public.portfolios set is_default=false where user_id=owner_id and is_default;
  insert into public.portfolios as existing select * from jsonb_populate_recordset(null::public.portfolios,next_portfolios)
    on conflict(user_id,id) do update set name=excluded.name,is_default=excluded.is_default
    where existing.name is distinct from excluded.name or existing.is_default is distinct from excluded.is_default;
  perform public.commit_portfolio_ledger(public.read_portfolio_ledger()->>'revision',request_id,next_transactions);
  -- FK makes deletion impossible unless every trade has already moved in this transaction.
  delete from public.portfolios p where p.user_id=owner_id and not exists(select 1 from jsonb_array_elements(next_portfolios) e where (e->>'id')::uuid=p.id);
  insert into public.portfolio_workspace_receipts(user_id,request_id,payload_hash) values(owner_id,request_id,payload_hash);
  return public.read_portfolio_ledger();
end;
$$;
revoke all on function public.commit_portfolio_workspace(text,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.commit_portfolio_workspace(text,uuid,jsonb,jsonb) to authenticated;
