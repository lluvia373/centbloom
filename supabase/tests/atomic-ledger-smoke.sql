-- Run in an isolated Supabase-compatible test database after the migration.
-- Production auth-user creation was not approved; do not run this on real accounts.
-- All test rows and the synthetic auth user are rolled back; no real user is selected.
begin;
set local statement_timeout = '15s';
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
insert into auth.users(id) values(auth.uid());
set local role authenticated;
do $$
declare
  initial jsonb := public.read_portfolio_ledger();
  saved jsonb;
  receipt uuid := gen_random_uuid();
  payload jsonb := jsonb_build_array(jsonb_build_object(
    'id',gen_random_uuid(),'user_id',auth.uid(),'symbol','RELEASE_QA','name','Isolated release test',
    'transaction_type','buy','trade_date','2026-01-01','quantity',1,'price',100,'fee',0,
    'currency','KRW','fx_rate_to_krw',1,'usd_krw_rate_at_transaction',1300,'created_at','2026-01-01T00:00:00Z'));
begin
  if jsonb_array_length(initial->'transactions')<>0 then raise exception 'QA user must be empty'; end if;
  saved := public.commit_portfolio_ledger(initial->>'revision',receipt,payload);
  if jsonb_array_length(saved->'transactions')<>1 then raise exception 'Commit did not persist'; end if;
  if public.commit_portfolio_ledger(initial->>'revision',receipt,payload) is distinct from saved then raise exception 'Retry changed state'; end if;
  begin
    perform public.commit_portfolio_ledger(initial->>'revision',gen_random_uuid(),'[]');
    raise exception 'Stale write unexpectedly accepted';
  exception when serialization_failure then null;
  end;
  begin
    perform public.commit_portfolio_ledger(saved->>'revision',gen_random_uuid(),jsonb_set(payload,'{0,price}','-1'));
    raise exception 'Invalid price unexpectedly accepted';
  exception when others then
    if sqlerrm <> 'Invalid transaction' then raise; end if;
  end;
  if public.read_portfolio_ledger() is distinct from saved then raise exception 'Failed replacement changed data'; end if;
  perform public.save_portfolio_performance(saved->>'revision','2026-01-01',
    '[{"date":"2026-01-01","cutoffAt":"2026-01-01T14:59:59Z","assetValueKRW":100,"twrIndex":100,"netFlowKRW":100,"cumulativeNetFlowKRW":100,"cumulativeProfitKRW":0,"active":true,"final":true}]');
  if (select count(*) from public.portfolio_snapshots)<>1 then raise exception 'Performance missing'; end if;
  perform public.commit_portfolio_ledger(saved->>'revision',gen_random_uuid(),'[]');
  if jsonb_array_length(public.read_portfolio_ledger()->'transactions')<>0 then raise exception 'Replacement did not delete'; end if;
end;
$$;
rollback;
select true as isolated_ledger_smoke_passed;
