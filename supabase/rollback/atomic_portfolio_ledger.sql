-- Maintenance only, after exporting data AND receipts and stopping all write clients.
-- This rolls back schema, NOT transaction data. See CLOUDFLARE.md.
begin;
drop function if exists public.save_portfolio_performance(text,timestamptz,jsonb);
drop function if exists public.commit_portfolio_ledger(text,uuid,jsonb);
drop function if exists public.read_portfolio_ledger();
drop trigger if exists portfolio_ledger_lock on public.portfolio_transactions;
drop function if exists public.lock_portfolio_ledger();
alter table public.portfolio_snapshots drop column if exists ledger_revision;
alter table public.portfolio_transactions drop column if exists ledger_position;
drop table if exists public.portfolio_commit_receipts;
commit;
