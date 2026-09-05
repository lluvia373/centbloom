import type { Transaction, TransactionType } from "@/lib/types";
export interface PortfolioTransactionRow {
  id: string;
  user_id: string;
  symbol: string;
  name: string;
  transaction_type: TransactionType;
  trade_date: string;
  quantity: number;
  price: number;
  fee: number;
  currency: string | null;
  fx_rate_to_krw: number | null;
  usd_krw_rate_at_transaction: number | null;
  created_at: string;
}

export function transactionToRow(userId: string, tx: Transaction) {
  return {
    id: tx.id,
    user_id: userId,
    symbol: tx.symbol,
    name: tx.name,
    transaction_type: tx.type,
    trade_date: tx.date,
    quantity: tx.quantity,
    price: tx.price,
    fee: tx.fee,
    currency: tx.currency ?? null,
    fx_rate_to_krw: tx.fxRateToKRW ?? null,
    usd_krw_rate_at_transaction: tx.usdKrwRateAtTransaction ?? null,
    created_at: tx.createdAt,
  };
}

export function rowToTransaction(row: PortfolioTransactionRow): Transaction {
  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    type: row.transaction_type,
    date: row.trade_date,
    quantity: Number(row.quantity),
    price: Number(row.price),
    fee: Number(row.fee),
    currency: row.currency ?? undefined,
    fxRateToKRW:
      row.fx_rate_to_krw == null ? undefined : Number(row.fx_rate_to_krw),
    usdKrwRateAtTransaction:
      row.usd_krw_rate_at_transaction == null
        ? undefined
        : Number(row.usd_krw_rate_at_transaction),
    createdAt: row.created_at,
  };
}
