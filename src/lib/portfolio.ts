import { currencyUnitScale, normalizeCurrency, toKRW } from "./currency";
import type { Holding, Transaction } from "./types";

const QUANTITY_EPSILON = 1e-8;
const poolKey = (tx: Transaction) => JSON.stringify([tx.portfolioId ?? "legacy", tx.symbol, ...(tx.costBasisPath ?? [])]);
const isCostPool = (pool: { portfolioId?: string; symbol: string; path: string[] }, tx: Transaction) =>
  pool.portfolioId === tx.portfolioId && pool.symbol === tx.symbol &&
  (tx.costBasisPath ?? []).every((part, index) => pool.path[index] === part);

export function validateTransactionHistory(
  transactions: Transaction[],
): string | null {
  const sorted = [...transactions].sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt),
  );
  const quantities = new Map<string, { portfolioId?: string; symbol: string; path: string[]; quantity: number }>();
  const currencyUnits = new Map<string, string>();

  for (const tx of sorted) {
    const positionKey = poolKey(tx);
    if (!Number.isFinite(tx.quantity) || tx.quantity <= 0) {
      return `${tx.symbol} 거래 수량은 0보다 커야 합니다.`;
    }
    if (!Number.isFinite(tx.price) || tx.price <= 0) {
      return `${tx.symbol} 거래 단가는 0보다 커야 합니다.`;
    }
    if (!Number.isFinite(tx.fee) || tx.fee < 0) {
      return `${tx.symbol} 수수료는 0 이상이어야 합니다.`;
    }

    if (tx.currency) {
      const unit = `${normalizeCurrency(tx.currency)}:${currencyUnitScale(tx.currency)}`;
      const previousUnit = currencyUnits.get(tx.symbol);
      if (previousUnit && previousUnit !== unit) {
        return `${tx.symbol} 거래의 통화 또는 가격 단위가 서로 다릅니다. 원본 기록을 확인해 주세요.`;
      }
      currencyUnits.set(tx.symbol, unit);
    }

    if (tx.type === "buy") {
      const previous = quantities.get(positionKey);
      quantities.set(positionKey, { portfolioId: tx.portfolioId, symbol: tx.symbol, path: tx.costBasisPath ?? [], quantity: (previous?.quantity ?? 0) + tx.quantity });
      continue;
    }
    const pools = [...quantities.values()].filter((pool) => isCostPool(pool, tx));
    const available = pools.reduce((sum, pool) => sum + pool.quantity, 0);

    if (tx.quantity > available + QUANTITY_EPSILON) {
      return `${tx.date} ${tx.symbol} 매도 수량(${tx.quantity})이 당시 보유 수량(${available})을 초과합니다.`;
    }

    const remaining = available > 0 ? Math.max(0, 1 - tx.quantity / available) : 0;
    for (const pool of pools) pool.quantity *= remaining;
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
      portfolioId?: string;
      path: string[];
    }
  >();

  const apply = (tx: Transaction) => {
    const key = poolKey(tx);
    if (tx.type === "buy") {
      const existing = positions.get(key);
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
        positions.set(key, {
          symbol: tx.symbol,
          name: tx.name,
          quantity: tx.quantity,
          totalCost: cost,
          totalCostKRW: costKRW,
          totalCostUSD: costUSD,
          currency: tx.currency,
          firstDate: tx.date,
          portfolioId: tx.portfolioId,
          path: tx.costBasisPath ?? [],
        });
      }
    } else {
      const pools = [...positions.entries()].filter(([, pool]) => isCostPool(pool, tx));
      const available = pools.reduce((sum, [, pool]) => sum + pool.quantity, 0);
      if (available <= 0) return;
      const remaining = Math.max(0, 1 - tx.quantity / available);
      for (const [poolId, pool] of pools) {
        pool.quantity *= remaining;
        pool.totalCost *= remaining;
        if (pool.totalCostKRW != null) pool.totalCostKRW *= remaining;
        if (pool.totalCostUSD != null) pool.totalCostUSD *= remaining;
        if (pool.quantity < QUANTITY_EPSILON) positions.delete(poolId);
      }
    }
  };

  const holdings = () => {
    // Cost bases are reduced inside each portfolio before same-listing positions merge.
    const combined = new Map<string, (typeof positions extends Map<string, infer P> ? P : never)>();
    for (const position of positions.values()) {
      const previous = combined.get(position.symbol);
      if (!previous) { combined.set(position.symbol, { ...position }); continue; }
      previous.quantity += position.quantity;
      previous.totalCost += position.totalCost;
      previous.totalCostKRW = previous.totalCostKRW != null && position.totalCostKRW != null ? previous.totalCostKRW + position.totalCostKRW : undefined;
      previous.totalCostUSD = previous.totalCostUSD != null && position.totalCostUSD != null ? previous.totalCostUSD + position.totalCostUSD : undefined;
      if (position.firstDate < previous.firstDate) previous.firstDate = position.firstDate;
    }
    return Array.from(combined.values()).map((p) => ({
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
  };
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
