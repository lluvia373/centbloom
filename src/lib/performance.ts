import { normalizeCurrency, toKRW } from "./currency";
import { createHoldingAccumulator } from "./portfolio";
import type {
  ChartPoint,
  PortfolioPerformancePoint,
  Transaction,
} from "./types";

const DAY_MS = 86_400_000;
const VALUE_EPSILON = 0.01;

export interface BuildPerformanceInput {
  transactions: Transaction[];
  trackingStartDate: string;
  endDate: string;
  pricesBySymbol: Record<string, ChartPoint[]>;
  fxByCurrency: Record<string, ChartPoint[]>;
  currentPrices?: Record<string, number>;
  currentFxRates?: Record<string, number>;
  previousPoints?: PortfolioPerformancePoint[];
  strict?: boolean;
}

export interface PerformanceMetrics {
  operatingReturn: number | null;
  moneyWeightedReturn: number | null;
  profitKRW: number;
  startValueKRW: number;
  endValueKRW: number;
}

export interface InactivePeriod {
  start: string;
  end: string;
}

export function kstDate(value = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export function kstCutoffAt(date: string): string {
  return `${date}T23:59:59+09:00`;
}

export function addCalendarDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().split("T")[0];
}

export function daysBetween(start: string, end: string): number {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  return Math.max(0, Math.round((endMs - startMs) / DAY_MS));
}

export function buildDailyPerformance({
  transactions,
  trackingStartDate,
  endDate,
  pricesBySymbol,
  fxByCurrency,
  currentPrices = {},
  currentFxRates = {},
  previousPoints = [],
  strict = false,
}: BuildPerformanceInput): PortfolioPerformancePoint[] {
  if (trackingStartDate > endDate) return [];

  const today = kstDate();
  const points: PortfolioPerformancePoint[] = [...previousPoints];
  const last = points.at(-1);
  let twrIndex = last?.twrIndex ?? 100;
  let cumulativeNetFlowKRW = last?.cumulativeNetFlowKRW ?? 0;
  let initialValueKRW = points[0]?.assetValueKRW ?? 0;
  const sorted = [...transactions].sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt),
  );
  const positions = createHoldingAccumulator();
  let transactionIndex = 0;
  const prices = valueCursors(pricesBySymbol);
  const rates = valueCursors(fxByCurrency);
  const flows = new Map<string, number>();
  // Preserve input order for daily floating-point flow accumulation.
  for (const tx of transactions) {
    if (
      strict &&
      (!tx.currency || (tx.currency !== "KRW" && !(tx.fxRateToKRW! > 0)))
    )
      throw new Error("거래 환율 보완이 필요합니다.");
    flows.set(tx.date, (flows.get(tx.date) ?? 0) + transactionFlowKRW(tx));
  }

  for (
    let date = last ? addCalendarDays(last.date, 1) : trackingStartDate;
    date <= endDate;
    date = addCalendarDays(date, 1)
  ) {
    while (
      transactionIndex < sorted.length &&
      sorted[transactionIndex].date <= date
    )
      positions.apply(sorted[transactionIndex++]);
    const holdings = positions.holdings();
    const assetValueKRW = holdings.reduce((sum, holding) => {
      const currency = normalizeCurrency(holding.currency ?? "USD");
      const historicalPrice = prices(holding.symbol, date);
      const price =
        date === today && currentPrices[holding.symbol] != null
          ? currentPrices[holding.symbol]
          : historicalPrice;
      const historicalFx = currency === "KRW" ? 1 : rates(currency, date);
      const fxRate =
        currency === "KRW"
          ? 1
          : date === today && currentFxRates[currency] != null
            ? currentFxRates[currency]
            : historicalFx;

      if (
        price == null ||
        fxRate == null ||
        (strict && (price <= 0 || fxRate <= 0))
      ) {
        if (strict)
          throw new Error(
            date + " " + holding.symbol + " 가격 또는 환율이 누락되었습니다.",
          );
        return sum;
      }
      return sum + toKRW(price * holding.quantity, currency, fxRate);
    }, 0);

    const netFlowKRW = flows.get(date) ?? 0;

    if (points.length === 0) {
      initialValueKRW = assetValueKRW;
    } else {
      const previous = points[points.length - 1];
      if (previous.assetValueKRW > VALUE_EPSILON) {
        const dailyReturn =
          (assetValueKRW - previous.assetValueKRW - netFlowKRW) /
          previous.assetValueKRW;
        if (Number.isFinite(dailyReturn)) {
          twrIndex *= Math.max(0, 1 + dailyReturn);
        }
      }
    }

    const performanceFlow = points.length === 0 ? 0 : netFlowKRW;
    cumulativeNetFlowKRW += performanceFlow;
    const cumulativeProfitKRW =
      assetValueKRW - initialValueKRW - cumulativeNetFlowKRW;

    points.push({
      date,
      cutoffAt: kstCutoffAt(date),
      assetValueKRW,
      twrIndex,
      netFlowKRW: performanceFlow,
      cumulativeNetFlowKRW,
      cumulativeProfitKRW,
      active: assetValueKRW > VALUE_EPSILON,
      final: date < today,
    });
  }

  return points;
}

export function calculatePerformanceMetrics(
  points: PortfolioPerformancePoint[],
  transactions: Transaction[],
  startDate: string,
  endDate: string,
): PerformanceMetrics {
  const selected = points.filter(
    (point) => point.date >= startDate && point.date <= endDate,
  );
  if (selected.length === 0) {
    return {
      operatingReturn: null,
      moneyWeightedReturn: null,
      profitKRW: 0,
      startValueKRW: 0,
      endValueKRW: 0,
    };
  }

  const first = selected[0];
  const last = selected[selected.length - 1];
  const operatingReturn =
    first.twrIndex > 0 ? (last.twrIndex / first.twrIndex - 1) * 100 : null;
  const periodTransactions = transactions.filter(
    (tx) => tx.date > first.date && tx.date <= last.date,
  );
  const flows = periodTransactions.map((tx) => ({
    date: tx.date,
    amount: transactionFlowKRW(tx),
  }));
  const netFlow = flows.reduce((sum, flow) => sum + flow.amount, 0);
  const totalDays = Math.max(1, daysBetween(first.date, last.date));
  const weightedFlow = flows.reduce((sum, flow) => {
    const elapsed = daysBetween(first.date, flow.date);
    const weight = Math.max(0, (totalDays - elapsed) / totalDays);
    return sum + flow.amount * weight;
  }, 0);
  const denominator = first.assetValueKRW + weightedFlow;
  const profitKRW = last.assetValueKRW - first.assetValueKRW - netFlow;
  const moneyWeightedReturn =
    denominator > VALUE_EPSILON ? (profitKRW / denominator) * 100 : null;

  return {
    operatingReturn,
    moneyWeightedReturn,
    profitKRW,
    startValueKRW: first.assetValueKRW,
    endValueKRW: last.assetValueKRW,
  };
}

export function findInactivePeriods(
  points: PortfolioPerformancePoint[],
): InactivePeriod[] {
  const periods: InactivePeriod[] = [];
  let start: string | null = null;

  points.forEach((point, index) => {
    if (!point.active && start == null) start = point.date;
    const isLast = index === points.length - 1;
    if (start && (point.active || isLast)) {
      const previous = points[Math.max(0, index - (point.active ? 1 : 0))];
      periods.push({ start, end: previous.date });
      start = null;
    }
  });

  return periods;
}

export function normalizePerformancePoints(
  points: PortfolioPerformancePoint[],
) {
  if (points.length === 0) return [];
  const base = points[0].twrIndex;
  return points.map((point) => ({
    ...point,
    portfolioReturn: base > 0 ? (point.twrIndex / base - 1) * 100 : 0,
  }));
}

export function transactionFlowKRW(transaction: Transaction): number {
  const currency = normalizeCurrency(transaction.currency ?? "USD");
  const fxRate = currency === "KRW" ? 1 : (transaction.fxRateToKRW ?? 0);
  if (fxRate <= 0) return 0;

  const gross = transaction.quantity * transaction.price;
  const nativeAmount =
    transaction.type === "buy"
      ? gross + transaction.fee
      : -(gross - transaction.fee);
  return toKRW(nativeAmount, currency, fxRate);
}

function valueCursors(series: Record<string, ChartPoint[]>) {
  const cursors = new Map<string, { index: number; value: number | null }>();
  return (key: string, date: string) => {
    let cursor = cursors.get(key);
    if (!cursor) {
      cursor = { index: 0, value: null };
      cursors.set(key, cursor);
    }
    const points = series[key] ?? [];
    while (cursor.index < points.length && points[cursor.index].date <= date) {
      const value = points[cursor.index++].close;
      if (value != null && Number.isFinite(value)) cursor.value = value;
    }
    return cursor.value;
  };
}
