import type { IntradayRange, IntradaySeries } from "@/features/market/intraday";
import { currencyUnitScale, normalizeCurrency } from "@/lib/currency";
import { addCalendarDays, kstDate } from "@/lib/performance";
import { deriveHoldings } from "@/lib/portfolio";
import { getIntradaySeries } from "@/lib/stock-api";
import type { DisplayCurrency, Holding, Transaction } from "@/lib/types";
import { mapLimited } from "@/shared/async/pool";

export interface IntradayPortfolioPoint {
  date: string;
  assetValue: number | null;
  assetValueKRW: number | null;
  portfolioReturn: number | null;
  reason?: "trade-time" | "market-data";
}
export interface IntradayPerformance {
  points: IntradayPortfolioPoint[];
  tradeDates: string[];
  missingMarketData: boolean;
  profitKRW: number | null;
}
export interface IntradayInput {
  transactions: Transaction[];
  range: IntradayRange;
  day: string;
  currency: DisplayCurrency;
}

function positionsByDay({ transactions, range, day }: IntradayInput) {
  const dates = Array.from({ length: range === "1d" ? 1 : 5 }, (_, i) => addCalendarDays(day, i - (range === "1d" ? 0 : 4)));
  return new Map(dates.map(date => [date, deriveHoldings(transactions.filter(tx => tx.date < date))]));
}

/** Exact quantities only on days without a trade. createdAt is never an execution time. */
export function buildIntradayPerformance(input: IntradayInput, series: Record<string, IntradaySeries>, now = Date.now()): IntradayPerformance {
  const positions = positionsByDay(input);
  const start = Date.parse(`${positions.keys().next().value}T00:00:00+09:00`);
  const step = input.range === "1d" ? 60_000 : 1_800_000;
  const end = Math.floor(Math.min(now, Date.parse(`${input.day}T00:00:00+09:00`) + 86_400_000 - 1,
    ...Object.values(series).map(item => Date.parse(item.endAt))) / step) * step;
  const tradeDates = [...new Set(input.transactions.filter(tx => positions.has(tx.date)).map(tx => tx.date))].sort();
  const tradeDays = new Set(tradeDates);
  const indexed = new Map(Object.entries(series).map(([symbol, item]) => [symbol, new Map(item.points.map(p => [p.at, p.close]))]));
  const valueAt = (symbol: string, at: string) => indexed.get(symbol)?.get(at) ?? null;
  const points: IntradayPortfolioPoint[] = [];
  let missingMarketData = false;
  for (let at = start; at <= end; at += step) {
    const date = new Date(at).toISOString();
    const day = kstDate(new Date(at));
    if (tradeDays.has(day)) {
      points.push({ date, assetValue: null, assetValueKRW: null, portfolioReturn: null, reason: "trade-time" });
      continue;
    }
    const holdings = positions.get(day) ?? [];
    let total = 0;
    for (const holding of holdings) {
      const priceSeries = series[holding.symbol];
      const price = valueAt(holding.symbol, date);
      const currency = normalizeCurrency(holding.currency);
      const fxSymbol = `${currency}KRW=X`;
      const rate = currency === "KRW" ? 1 : series[fxSymbol]?.currency === "KRW" ? valueAt(fxSymbol, date) : null;
      if (!priceSeries || normalizeCurrency(priceSeries.currency) !== currency || price == null || rate == null ||
        !Number.isFinite(price) || price <= 0 || !Number.isFinite(rate) || rate <= 0) { total = NaN; break; }
      total += holding.quantity * price * currencyUnitScale(priceSeries.currency) * rate;
    }
    const usdRate = input.currency === "USD" && holdings.length > 0
      ? series["USDKRW=X"]?.currency === "KRW" ? valueAt("USDKRW=X", date) : null : 1;
    const assetValueKRW = Number.isFinite(total) ? total : null;
    const converted = assetValueKRW !== null && usdRate !== null && usdRate > 0 ? assetValueKRW / usdRate : NaN;
    const assetValue = Number.isFinite(converted) ? converted : null;
    if (assetValue === null) missingMarketData = true;
    points.push({ date, assetValue, assetValueKRW, portfolioReturn: null,
      ...(assetValue === null ? { reason: "market-data" as const } : {}) });
  }
  const baseline = points[0]?.assetValueKRW;
  // With no flows in the entire window, change in value is a valid return. Otherwise
  // minute-level linking cannot be reconstructed from date-only executions.
  if (!tradeDates.length && baseline != null && baseline > 0) {
    for (const point of points) if (point.assetValueKRW != null) {
      const value = (point.assetValueKRW / baseline - 1) * 100;
      point.portfolioReturn = Number.isFinite(value) ? value : null;
    }
  }
  const last = points.at(-1)?.assetValueKRW;
  return { points, tradeDates, missingMarketData,
    profitKRW: !tradeDates.length && baseline != null && last != null ? last - baseline : null };
}

export async function loadIntradayPerformance(input: IntradayInput, signal: AbortSignal): Promise<IntradayPerformance> {
  const positions = positionsByDay(input);
  const tradeDays = new Set(input.transactions.map(tx => tx.date));
  const required = new Map<string, Holding>();
  for (const [date, holdings] of positions) if (!tradeDays.has(date))
    for (const holding of holdings) required.set(holding.symbol, holding);
  const symbols = new Set(required.keys());
  for (const holding of required.values()) {
    const currency = normalizeCurrency(holding.currency);
    if (currency !== "KRW") symbols.add(`${currency}KRW=X`);
  }
  if (input.currency === "USD" && required.size) symbols.add("USDKRW=X");
  const results = await mapLimited([...symbols], 6, async symbol =>
    [symbol, await getIntradaySeries(symbol, input.range, input.day, signal)] as const);
  signal.throwIfAborted();
  return buildIntradayPerformance(input, Object.fromEntries(results));
}
