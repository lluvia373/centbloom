import { planHistoryRequests } from "./request-plan";
import { addCalendarDays, kstDate } from "@/lib/performance";
import { getChartSeries } from "@/lib/stock-api";
import type { PortfolioPerformancePoint, Transaction } from "@/lib/types";
import { mapLimited } from "@/shared/async/pool";
import { calculateHistory } from "./calculate";
import { readHistory, saveHistory } from "./repository";
export interface HistoryInput {
  userId: string | null;
  revision: string;
  transactions: Transaction[];
  today: string;
}
export interface HistoryResult {
  points: PortfolioPerformancePoint[];
  trackingStartedAt: string | null;
  error: string | null;
}
export async function loadPerformance(
  input: HistoryInput,
  signal: AbortSignal,
): Promise<HistoryResult> {
  const { userId, revision, transactions, today } = input;
  if (!transactions.length)
    return { points: [], trackingStartedAt: null, error: null };
  const { saved, startedAt: persisted } = await readHistory(
    userId,
    revision,
    signal,
  );
  const startedAt =
    persisted ?? transactions.map((tx) => tx.createdAt).sort()[0];
  const start = kstDate(new Date(startedAt));
  // Legacy snapshots have no transaction revision. Never treat them as verified calculations.
  let previousPoints =
    saved?.revision === revision && saved.startedAt === startedAt
      ? saved.points.filter((p) => p.final && p.date >= start && p.date < today)
      : [];
  if (
    previousPoints.some(
      (point, index) => point.date !== addCalendarDays(start, index),
    )
  )
    previousPoints = [];
  const next = previousPoints.length
    ? addCalendarDays(previousPoints.at(-1)!.date, 1)
    : start;
  const fetchStart = addCalendarDays(next, -7);
  const { requests, fallbackStart } = planHistoryRequests(
    transactions,
    next,
    today,
  );
  const series = await mapLimited(requests, 6, async (request) => {
    try {
      const result = await getChartSeries(
        request.symbol,
        fetchStart,
        today,
        signal,
      );
      // A suspended listing can have no closing price in the recent lookback.
      if (
        fallbackStart < fetchStart &&
        !result.points.some((p) => p.date <= next)
      )
        return {
          ...request,
          series: await getChartSeries(
            request.symbol,
            fallbackStart,
            today,
            signal,
          ),
        };
      return { ...request, series: result };
    } catch (error) {
      if (
        signal.aborted ||
        !(error instanceof Error) ||
        error.cause !== 404 ||
        fallbackStart >= fetchStart
      )
        throw error;
      return {
        ...request,
        series: await getChartSeries(
          request.symbol,
          fallbackStart,
          today,
          signal,
        ),
      };
    }
  });
  signal.throwIfAborted();
  const points = await calculateHistory(
    {
      transactions,
      trackingStartDate: start,
      endDate: today,
      previousPoints,
      strict: true,
      pricesBySymbol: Object.fromEntries(
        series
          .filter((s) => s.type === "price")
          .map((s) => [s.key, s.series.points]),
      ),
      fxByCurrency: Object.fromEntries(
        series
          .filter((s) => s.type === "fx")
          .map((s) => [s.key, s.series.points]),
      ),
    },
    signal,
  );
  const error = await saveHistory(
    userId,
    { revision, startedAt, points },
    saved?.serverSynced ? points.slice(previousPoints.length) : points,
    signal,
  );
  return { points, trackingStartedAt: startedAt, error };
}
