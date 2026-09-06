import { createRequestCache } from "@/shared/async/request-cache";
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
    { signal, ttlMs: 5_000 },
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
export async function getFxRateToKRW(
  currency: string,
  date?: string,
  signal?: AbortSignal,
): Promise<number> {
  const normalized = normalizeCurrency(currency);
  if (normalized === BASE_CURRENCY) return 1;
  const symbol = `${normalized}${BASE_CURRENCY}=X`;
  return date
    ? (await getHistoricalDay(symbol, date, signal)).close
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
