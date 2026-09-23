import { normalizeCurrency } from "@/lib/currency";
import { addCalendarDays, buildSecuritiesReturnSeries } from "@/lib/performance";
import type { PortfolioPerformancePoint, Transaction } from "@/lib/types";

export type PeriodGranularity = "month" | "year";

export interface PeriodSummary {
  key: string;
  /** Inclusive dates actually covered, including a partial first/current period. */
  startDate: string;
  endDate: string;
  profitKRW: number | null;
  securitiesReturn: number | null;
  inactive: boolean;
  /** Every calendar day is present and finalized, not just the last day. */
  complete: boolean;
}

interface PeriodBucket {
  points: PortfolioPerformancePoint[];
  transactions: Transaction[];
}

/** Calendar summaries reuse the chart's daily calculation; never sum monthly percentages. */
export function buildPeriodSummaries(
  points: PortfolioPerformancePoint[],
  transactions: Transaction[],
  granularity: PeriodGranularity,
): PeriodSummary[] {
  const keyFor = (date: string) => date.slice(0, granularity === "month" ? 7 : 4);
  const buckets = new Map<string, PeriodBucket>();
  for (const point of points) {
    if (!isCalendarDate(point.date)) continue;
    const key = keyFor(point.date);
    const bucket: PeriodBucket = buckets.get(key) ?? { points: [], transactions: [] };
    bucket.points.push(point);
    buckets.set(key, bucket);
  }
  for (const transaction of transactions) {
    buckets.get(keyFor(transaction.date))?.transactions.push(transaction);
  }

  return [...buckets.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([key, bucket]) => {
    bucket.points.sort((a, b) => a.date.localeCompare(b.date));
    const first = bucket.points[0];
    const last = bucket.points[bucket.points.length - 1];
    const selectedTransactions = bucket.transactions.filter(
      transaction => transaction.date >= first.date && transaction.date <= last.date,
    );
    const continuous = bucket.points.every((point, index) => index === 0 ||
      (point.date === addCalendarDays(bucket.points[index - 1].date, 1) &&
        point.openingValueKRW === bucket.points[index - 1].assetValueKRW));
    const valid = continuous && bucket.points.every(point =>
      isNonnegativeFinite(point.openingValueKRW) && isNonnegativeFinite(point.assetValueKRW),
    ) && selectedTransactions.every(isValidTransaction);
    const result = valid ? buildSecuritiesReturnSeries(bucket.points, selectedTransactions).at(-1) : undefined;
    const profitKRW = result && Number.isFinite(result.periodProfitKRW) ? result.periodProfitKRW : null;
    const securitiesReturn = result?.portfolioReturn ?? null;
    const calendarStart = granularity === "month" ? `${key}-01` : `${key}-01-01`;
    const nextDate = addCalendarDays(last.date, 1);
    const inactive = valid && selectedTransactions.length === 0 && bucket.points.every(point =>
      point.openingValueKRW === 0 && point.assetValueKRW === 0,
    );
    return {
      key,
      startDate: first.date,
      endDate: last.date,
      profitKRW,
      securitiesReturn,
      inactive,
      complete: valid && first.date === calendarStart && keyFor(nextDate) !== key &&
        bucket.points.every(point => point.final),
    };
  });
}

function isNonnegativeFinite(value: number | undefined): value is number {
  return value != null && Number.isFinite(value) && value >= 0;
}

function isCalendarDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function isValidTransaction(transaction: Transaction): boolean {
  const currency = normalizeCurrency(transaction.currency);
  return isCalendarDate(transaction.date) && (transaction.type === "buy" || transaction.type === "sell") &&
    Number.isFinite(transaction.quantity) && transaction.quantity > 0 &&
    isNonnegativeFinite(transaction.price) && isNonnegativeFinite(transaction.fee) &&
    (currency === "KRW" || (Number.isFinite(transaction.fxRateToKRW) && transaction.fxRateToKRW! > 0));
}
