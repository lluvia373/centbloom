create table if not exists public.portfolio_transactions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  name text not null,
  transaction_type text not null check (transaction_type in ('buy', 'sell')),
  trade_date date not null,
  quantity numeric not null check (quantity > 0),
  price numeric not null check (price > 0),
  fee numeric not null default 0 check (fee >= 0),
  currency text,
  fx_rate_to_krw numeric,
  usd_krw_rate_at_transaction numeric,
  created_at timestamptz not null default now()
);

create index if not exists portfolio_transactions_user_trade_date_idx
  on public.portfolio_transactions (user_id, trade_date desc, created_at desc);

alter table public.portfolio_transactions enable row level security;

create policy "Users can manage their own portfolio transactions"
  on public.portfolio_transactions
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.portfolio_transactions to authenticated;

create table if not exists public.portfolio_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_currency text not null default 'KRW' check (display_currency in ('KRW', 'USD')),
  updated_at timestamptz not null default now()
);

alter table public.portfolio_preferences enable row level security;

create policy "Users can manage their own portfolio preferences"
  on public.portfolio_preferences
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.portfolio_preferences to authenticated;

