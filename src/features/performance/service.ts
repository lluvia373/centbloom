import { planHistoryRequests } from "./request-plan";
import { addCalendarDays, kstDate, PERFORMANCE_CALCULATION_VERSION, type BuildPerformanceInput } from "@/lib/performance";
import { getChartSeries, getDailyFxHistory, getQuote } from "@/lib/stock-api";
import { normalizeCurrency } from "@/lib/currency";
import { deriveHoldings } from "@/lib/portfolio";
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
  const earliestTrade = transactions.map(tx => tx.date).sort()[0];
  const recordedStart = persisted ?? transactions.map((tx) => tx.createdAt).sort()[0];
  // Recording a past trade today must not discard its investment history.
  const startedAt = kstDate(new Date(recordedStart)) > earliestTrade
    ? `${earliestTrade}T00:00:00+09:00`
    : recordedStart;
  const start = kstDate(new Date(startedAt));
  const refreshStart = addCalendarDays(today, -90);
  // Server/legacy snapshots have no calculation version: rebuild them before reuse.
  let previousPoints =
    saved?.calculationVersion === PERFORMANCE_CALCULATION_VERSION &&
    saved.points.every(point => Number.isFinite(point.openingValueKRW) && point.openingValueKRW! >= 0) &&
    saved.revision === revision && saved.startedAt === startedAt
      ? saved.points.filter((p) => p.final && p.date >= start && p.date < refreshStart)
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
  const hasLiveDay = today === kstDate();
  const historicalEnd = hasLiveDay ? addCalendarDays(today, -1) : today;
  const { requests, fallbackStart } = planHistoryRequests(
    transactions,
    next,
    today,
    historicalEnd,
  );
  const currentCurrencies = hasLiveDay
    ? [...new Set(deriveHoldings(transactions.filter(tx => tx.date <= today))
      .map(holding => normalizeCurrency(holding.currency ?? "USD")))].filter(currency => currency !== "KRW")
    : [];
  const [series, currentFx] = await Promise.all([
    mapLimited(requests, 6, async (request) => {
      if (request.type === "fx") return {
        ...request,
        series: await getDailyFxHistory(request.key, request.start, request.end, signal),
      };
      try {
        const result = await getChartSeries(request.symbol, fetchStart, today, signal);
        // A suspended listing can have no closing price in the recent lookback.
        if (fallbackStart < fetchStart && !result.points.some((p) => p.date <= next))
          return { ...request, series: await getChartSeries(request.symbol, fallbackStart, today, signal) };
        return { ...request, series: result };
      } catch (error) {
        if (signal.aborted || !(error instanceof Error) || error.cause !== 404 || fallbackStart >= fetchStart)
          throw error;
        return { ...request, series: await getChartSeries(request.symbol, fallbackStart, today, signal) };
      }
    }),
    mapLimited(currentCurrencies, 6, async (currency) => {
      const quote = await getQuote(`${currency}KRW=X`, signal);
      if (quote.currency !== "KRW") throw new Error(`${today} ${currency}/KRW 현재 환율의 통화가 올바르지 않습니다.`);
      return [currency, quote.price] as const;
    }),
  ]);
  signal.throwIfAborted();
  const fxByCurrency: BuildPerformanceInput["fxByCurrency"] = {};
  for (const item of series) {
    if (item.type === "fx") (fxByCurrency[item.key] ??= []).push(...item.series.points);
  }
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
      fxByCurrency,
      currentFxRates: Object.fromEntries(currentFx),
    },
    signal,
  );
  const error = await saveHistory(
    userId,
    { calculationVersion: PERFORMANCE_CALCULATION_VERSION, revision, startedAt, points },
    saved?.serverSynced ? points.slice(previousPoints.length) : points,
    signal,
  );
  return { points, trackingStartedAt: startedAt, error };
}
