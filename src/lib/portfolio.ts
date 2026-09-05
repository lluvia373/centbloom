import { toKRW } from "./currency";
import type { Holding, Transaction } from "./types";

const QUANTITY_EPSILON = 1e-8;

export function validateTransactionHistory(
  transactions: Transaction[],
): string | null {
  const sorted = [...transactions].sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt),
  );
  const quantities = new Map<string, number>();

  for (const tx of sorted) {
    if (!Number.isFinite(tx.quantity) || tx.quantity <= 0) {
      return `${tx.symbol} 거래 수량은 0보다 커야 합니다.`;
    }
    if (!Number.isFinite(tx.price) || tx.price <= 0) {
      return `${tx.symbol} 거래 단가는 0보다 커야 합니다.`;
    }
    if (!Number.isFinite(tx.fee) || tx.fee < 0) {
      return `${tx.symbol} 수수료는 0 이상이어야 합니다.`;
    }

    const available = quantities.get(tx.symbol) ?? 0;
    if (tx.type === "buy") {
      quantities.set(tx.symbol, available + tx.quantity);
      continue;
    }

    if (tx.quantity > available + QUANTITY_EPSILON) {
      return `${tx.date} ${tx.symbol} 매도 수량(${tx.quantity})이 당시 보유 수량(${available})을 초과합니다.`;
    }

    const next = available - tx.quantity;
    quantities.set(tx.symbol, Math.abs(next) < QUANTITY_EPSILON ? 0 : next);
  }

  return null;
}

export function createHoldingAccumulator() {
  const positions = new Map<
    string,
    {
      symbol: string;
      name: string;
      quantity: number;
      totalCost: number;
      totalCostKRW?: number;
      totalCostUSD?: number;
      currency?: string;
      firstDate: string;
    }
  >();

  const apply = (tx: Transaction) => {
    if (tx.type === "buy") {
      const existing = positions.get(tx.symbol);
      const cost = tx.quantity * tx.price + tx.fee;
      const costKRW =
        tx.currency && tx.fxRateToKRW != null
          ? toKRW(cost, tx.currency, tx.fxRateToKRW)
          : undefined;
      const costUSD =
        costKRW != null &&
        tx.usdKrwRateAtTransaction != null &&
        tx.usdKrwRateAtTransaction > 0
          ? costKRW / tx.usdKrwRateAtTransaction
          : undefined;

      if (existing) {
        existing.quantity += tx.quantity;
        existing.totalCost += cost;
        existing.currency ??= tx.currency;

        if (costKRW != null && existing.totalCostKRW != null) {
          existing.totalCostKRW += costKRW;
        } else if (
          costKRW != null &&
          existing.totalCostKRW == null &&
          existing.quantity === tx.quantity
        ) {
          existing.totalCostKRW = costKRW;
        } else {
          existing.totalCostKRW = undefined;
        }

        if (costUSD != null && existing.totalCostUSD != null) {
          existing.totalCostUSD += costUSD;
        } else if (
          costUSD != null &&
          existing.totalCostUSD == null &&
          existing.quantity === tx.quantity
        ) {
          existing.totalCostUSD = costUSD;
        } else {
          existing.totalCostUSD = undefined;
        }
      } else {
        positions.set(tx.symbol, {
          symbol: tx.symbol,
          name: tx.name,
          quantity: tx.quantity,
          totalCost: cost,
          totalCostKRW: costKRW,
          totalCostUSD: costUSD,
          currency: tx.currency,
          firstDate: tx.date,
        });
      }
    } else {
      const existing = positions.get(tx.symbol);
      if (!existing || existing.quantity <= 0) return;

      const avgCost = existing.totalCost / existing.quantity;
      const avgCostKRW =
        existing.totalCostKRW != null
          ? existing.totalCostKRW / existing.quantity
          : undefined;
      const avgCostUSD =
        existing.totalCostUSD != null
          ? existing.totalCostUSD / existing.quantity
          : undefined;

      existing.quantity -= tx.quantity;
      existing.totalCost -= avgCost * tx.quantity;
      if (avgCostKRW != null && existing.totalCostKRW != null) {
        existing.totalCostKRW -= avgCostKRW * tx.quantity;
      }
      if (avgCostUSD != null && existing.totalCostUSD != null) {
        existing.totalCostUSD -= avgCostUSD * tx.quantity;
      }

      if (existing.quantity < QUANTITY_EPSILON) {
        positions.delete(tx.symbol);
      }
    }
  };

  const holdings = () =>
    Array.from(positions.values()).map((p) => ({
      id: p.symbol,
      symbol: p.symbol,
      name: p.name,
      quantity: p.quantity,
      avgCost: p.quantity > 0 ? p.totalCost / p.quantity : 0,
      currency: p.currency,
      costBasisKRW: p.totalCostKRW,
      costBasisUSD: p.totalCostUSD,
      addedAt: p.firstDate,
    }));
  return { apply, holdings };
}

export function deriveHoldings(transactions: Transaction[]): Holding[] {
  const accumulator = createHoldingAccumulator();
  [...transactions]
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt),
    )
    .forEach(accumulator.apply);
  return accumulator.holdings();
}

export function getAvailableQuantity(
  transactions: Transaction[],
  symbol: string,
): number {
  return (
    deriveHoldings(transactions).find((h) => h.symbol === symbol)?.quantity ?? 0
  );
}
