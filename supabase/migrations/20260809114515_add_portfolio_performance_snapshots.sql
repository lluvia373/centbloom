alter table public.portfolio_preferences
  add column if not exists portfolio_started_at timestamptz,
  add column if not exists snapshot_cutoff_time time not null default '23:59:59',
  add column if not exists snapshot_timezone text not null default 'Asia/Seoul';

create table if not exists public.portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_date date not null,
  cutoff_at timestamptz not null,
  captured_at timestamptz not null default now(),
  portfolio_started_at timestamptz not null,
  total_assets_krw numeric not null check (total_assets_krw >= 0),
  investment_assets_krw numeric not null check (investment_assets_krw >= 0),
  cash_assets_krw numeric not null default 0 check (cash_assets_krw >= 0),
  twr_index numeric not null default 100 check (twr_index >= 0),
  net_flow_krw numeric not null default 0,
  cumulative_net_flow_krw numeric not null default 0,
  cumulative_profit_krw numeric not null default 0,
  is_active boolean not null default false,
  is_final boolean not null default false,
  valuation_method text not null default 'reconstructed_daily_close'
    check (valuation_method in ('reconstructed_daily_close', 'live_cutoff')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, snapshot_date)
);

create index if not exists portfolio_snapshots_user_date_idx
  on public.portfolio_snapshots (user_id, snapshot_date desc);

alter table public.portfolio_snapshots enable row level security;

revoke all on table public.portfolio_snapshots from anon;
grant select, insert, update, delete on table public.portfolio_snapshots to authenticated;
grant select, insert, update, delete on table public.portfolio_snapshots to service_role;

drop policy if exists "Users can manage their own portfolio snapshots" on public.portfolio_snapshots;
create policy "Users can manage their own portfolio snapshots"
  on public.portfolio_snapshots
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

