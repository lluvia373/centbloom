import { createRequestCache } from "@/shared/async/request-cache";
import type { MidnightBaseline } from "@/features/market/baseline";
import { FX_HISTORY_MAX_CARRY_DAYS, fxToday, shiftFxDate, validFxDate, type DailyFxSeries } from "@/features/market/fx-history";
import { BASE_CURRENCY, normalizeCurrency } from "./currency";
import type { MarketFilter } from "./markets";
import type {
  ChartPoint,
  ChartSeries,
  DayOHLC,
  StockQuote,
  StockSearchResult,
} from "./types";

export const marketRequests = createRequestCache();
export function getMidnightBaseline(symbol: string, date: string, signal?: AbortSignal): Promise<MidnightBaseline> {
  symbol = symbol.trim().toUpperCase();
  return marketRequests.request(`midnight:${symbol}:${date}`,
    (s) => json<MidnightBaseline>(`/api/baseline/${encodeURIComponent(symbol)}?date=${encodeURIComponent(date)}`, s),
    { signal, ttlMs: 60_000, timeoutMs: 60_000 });
}
async function json<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error : `시장 데이터 조회에 실패했습니다. (HTTP ${res.status})`,
      { cause: res.status },
    );
  }
  return res.json();
}
export function searchStocks(
  query: string,
  market: MarketFilter = "all",
  signal?: AbortSignal,
): Promise<StockSearchResult[]> {
  const q = query.trim();
  return marketRequests.request(
    `search:${market}:${q.toLowerCase()}`,
    (s) => json(`/api/search?q=${encodeURIComponent(q)}&market=${market}`, s),
    { signal, ttlMs: 60_000 },
  );
}
export function getQuote(
  symbol: string,
  signal?: AbortSignal,
): Promise<StockQuote> {
  symbol = symbol.trim().toUpperCase();
  return marketRequests.request(
    `quote:${symbol}`,
    async (s) => {
      const quote = await json<StockQuote>(
        `/api/quote/${encodeURIComponent(symbol)}`,
        s,
      );
      if (
        !Number.isFinite(quote.price) ||
        quote.price <= 0 ||
        !/^(?:[A-Z]{3}|GBp)$/.test(quote.currency)
      )
        throw new Error(`유효한 시세가 없습니다. (${symbol})`);
      return quote;
    },
    { signal, ttlMs: 5_000, timeoutMs: symbol.endsWith("=X") ? 60_000 : 20_000 },
  );
}
export function getChart(
  symbol: string,
  range = "6mo",
  signal?: AbortSignal,
): Promise<ChartPoint[]> {
  symbol = symbol.trim().toUpperCase();
  return marketRequests.request(
    `chart:${symbol}:${range}`,
    async (s) =>
      validatePoints(
        await json<ChartPoint[]>(
          `/api/chart/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}`,
          s,
        ),
      ),
    { signal, ttlMs: 60_000 },
  );
}
export function getChartSeries(
  symbol: string,
  start: string,
  end: string,
  signal?: AbortSignal,
): Promise<ChartSeries> {
  symbol = symbol.trim().toUpperCase();
  const params = new URLSearchParams({ start, end, detailed: "true" });
  return marketRequests.request(
    `series:${symbol}:${start}:${end}`,
    async (s) => {
      const series = await json<ChartSeries>(
        `/api/chart/${encodeURIComponent(symbol)}?${params}`,
        s,
      );
      validatePoints(series.points);
      return series;
    },
    { signal, ttlMs: 60_000 },
  );
}
export function getHistoricalDay(
  symbol: string,
  date: string,
  signal?: AbortSignal,
): Promise<DayOHLC> {
  symbol = symbol.trim().toUpperCase();
  return marketRequests.request(
    `day:${symbol}:${date}`,
    async (s) => {
      const day = await json<DayOHLC>(
        `/api/historical/${encodeURIComponent(symbol)}?date=${encodeURIComponent(date)}`,
        s,
      );
      if (!Number.isFinite(day.close) || day.close <= 0)
        throw new Error("유효한 과거 가격이 없습니다.");
      return day;
    },
    { signal, ttlMs: 300_000 },
  );
}
export function getDailyFxHistory(
  currency: string,
  start: string,
  end: string,
  signal?: AbortSignal,
): Promise<DailyFxSeries> {
  currency = normalizeCurrency(currency);
  if (!/^[A-Z]{3}$/.test(currency) || !validFxDate(start) || !validFxDate(end) || start > end || end > fxToday())
    return Promise.reject(new Error("일별 환율의 통화와 조회 기간이 올바르지 않습니다."));
  const params = new URLSearchParams({ currency, start, end });
  return marketRequests.request(`daily-fx:${currency}:${start}:${end}`, async (s) => {
    const series = await json<DailyFxSeries>(`/api/fx-history?${params}`, s);
    const count = (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
    if (!series || series.currency !== currency || series.baseCurrency !== "KRW" ||
      series.method !== "daily-reference" || series.source !== "ecb-reference" ||
      !Array.isArray(series.points) || series.points.length !== count || series.points.some((point, index) =>
        !point || point.date !== shiftFxDate(start, index) || !Number.isFinite(point.close) || point.close <= 0 ||
        !validFxDate(point.referenceDate) || point.referenceDate > point.date ||
        Date.parse(point.date) - Date.parse(point.referenceDate) > FX_HISTORY_MAX_CARRY_DAYS * 86400000 ||
        point.carried !== (point.referenceDate !== point.date) || point.source !== "ecb-reference"))
      throw new Error(`${currency}/KRW 일별 환율의 날짜·출처·값을 확인하지 못했습니다.`);
    return series;
  }, { signal, ttlMs: 60_000, timeoutMs: 60_000 });
}
export async function getFxRateToKRW(
  currency: string,
  date?: string,
  signal?: AbortSignal,
): Promise<number> {
  const normalized = normalizeCurrency(currency);
  if (normalized === BASE_CURRENCY) return 1;
  const symbol = `${normalized}${BASE_CURRENCY}=X`;
  return date && date !== fxToday()
    ? (await getDailyFxHistory(normalized, date, date, signal)).points[0].close
    : (await getQuote(symbol, signal)).price;
}

function validatePoints(points: ChartPoint[]): ChartPoint[] {
  if (
    !Array.isArray(points) ||
    !points.length ||
    points.some(
      (p) =>
        !Number.isFinite(p.close) ||
        p.close <= 0 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(p.date),
    )
  )
    throw new Error("유효한 차트 가격이 없습니다.");
  return points;
}
