import { createRequestCache } from "@/shared/async/request-cache";
import type { MidnightBaseline } from "@/features/market/baseline";
import type { IntradayRange, IntradaySeries } from "@/features/market/intraday";
import type { QuoteBatchResult } from "@/features/market/quote-batch";
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
  let res: Response;
  try { res = await fetch(url, { signal, cache: "no-store" }); }
  catch (error) {
    signal.throwIfAborted();
    throw new Error("시장 데이터에 연결하지 못했습니다.", { cause: error instanceof TypeError ? "network" : error });
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error : `시장 데이터 조회에 실패했습니다. (HTTP ${res.status})`,
      { cause: res.status },
    );
  }
  try { return await res.json(); }
  catch (error) {
    signal.throwIfAborted();
    if (error instanceof TypeError)
      throw new Error("시장 데이터 수신이 중단되었습니다.", { cause: "network" });
    throw error;
  }
}

function recoverableRequest<T>(
  key: string,
  label: string,
  loader: (signal: AbortSignal) => Promise<T>,
  options: { signal?: AbortSignal; ttlMs: number; timeoutMs?: number; priority?: "normal" | "interactive" },
): Promise<T> {
  const diagnostic = (event: string, error: unknown) => console.warn(event, {
    request: key,
    reason: error instanceof Error
      ? error.name === "TimeoutError" ? (error.message.includes("대기") ? "queue-timeout" : "request-timeout")
        : error.cause === "network" ? "network"
          : typeof error.cause === "number" ? "http" : "invalid-response"
      : "unknown",
    status: error instanceof Error && typeof error.cause === "number" ? error.cause : null,
  });
  return marketRequests.request(key, loader, {
    ...options,
    retry: {
      limit: 1, delayMs: 500,
      when: error => error instanceof Error && (error.name === "TimeoutError" || error.cause === "network" ||
        (typeof error.cause === "number" && [408, 429, 500, 502, 503, 504].includes(error.cause))),
      onRetry: error => diagnostic("market_request_retry", error),
    },
  }).catch(error => {
    if (options.signal?.aborted) throw error;
    diagnostic("market_request_failed", error);
    const detail = error instanceof Error ? error.message : "시장 데이터 조회 실패";
    // Keep the status for the suspended-listing 404 fallback; never return partial data.
    const failure = new Error(`${label}: ${detail}`, { cause: error instanceof Error ? error.cause : undefined });
    if (error instanceof Error && error.name === "TimeoutError") failure.name = error.name;
    throw failure;
  });
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
    { signal, ttlMs: 60_000, priority: "interactive" },
  );
}
export function getQuote(
  symbol: string,
  signal?: AbortSignal,
): Promise<StockQuote> {
  symbol = symbol.trim().toUpperCase();
  return recoverableRequest(
    `quote:${symbol}`,
    symbol.endsWith("=X") ? `${symbol} 현재 환율 조회` : `${symbol} 현재 시세 조회`,
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
export function getQuotes(symbols: string[], signal?: AbortSignal): Promise<QuoteBatchResult> {
  const requested = [...new Set(symbols.map(symbol => symbol.trim().toUpperCase()))].sort();
  if (!requested.length || requested.length > 50 || requested.some(symbol =>
    !/^[A-Z0-9.^=_-]{1,40}$/.test(symbol) || symbol.endsWith("=X")))
    return Promise.reject(new Error("묶음 시세의 종목 목록이 올바르지 않습니다.", { cause: 400 }));
  const params = new URLSearchParams({ symbols: requested.join(",") });
  const key = `quotes:${requested.join(",")}`;
  return recoverableRequest(key, "묶음 시세 조회", async s => {
    const result = await json<QuoteBatchResult>(`/api/quotes?${params}`, s);
    if (!result || typeof result.quotes !== "object" || !result.quotes || Array.isArray(result.quotes) ||
      typeof result.errors !== "object" || !result.errors || Array.isArray(result.errors))
      throw new Error("묶음 시세 응답을 확인하지 못했습니다.", { cause: 502 });
    const quotes: QuoteBatchResult["quotes"] = {}, errors: QuoteBatchResult["errors"] = {};
    for (const symbol of requested) {
      const hasQuote = Object.hasOwn(result.quotes, symbol), hasError = Object.hasOwn(result.errors, symbol);
      const quote = result.quotes[symbol], error = result.errors[symbol];
      if (hasQuote && !hasError && quote && quote.symbol === symbol && Number.isFinite(quote.price) &&
        quote.price > 0 && /^(?:[A-Z]{3}|GBp)$/.test(quote.currency)) quotes[symbol] = quote;
      else if (hasError && !hasQuote && error && typeof error.message === "string" && error.message.trim() &&
        Number.isInteger(error.status) && error.status >= 400 && error.status <= 599) errors[symbol] = error;
      else errors[symbol] = { message: `${symbol} 시세의 종목·통화·가격을 확인하지 못했습니다.`, status: 502 };
    }
    return { quotes, errors };
  }, { signal, ttlMs: 5_000, timeoutMs: 20_000, priority: "interactive" }).then(result => {
    // Partial successes may display immediately, but a failed member must not be cached.
    if (Object.keys(result.errors).length) marketRequests.invalidate(key);
    return result;
  });
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
  return recoverableRequest(
    `series:${symbol}:${start}:${end}`,
    `${symbol} 과거 시세 조회`,
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
export function getIntradaySeries(symbol: string, range: IntradayRange, day: string, signal?: AbortSignal): Promise<IntradaySeries> {
  symbol = symbol.trim().toUpperCase();
  const params = new URLSearchParams({ intraday: range, day });
  return recoverableRequest(`intraday:${symbol}:${range}:${day}`, `${symbol} 시간별 시세 조회`, async (s) => {
    const series = await json<IntradaySeries>(`/api/chart/${encodeURIComponent(symbol)}?${params}`, s);
    const step = range === "1d" ? 60_000 : 1_800_000;
    const start = Date.parse(`${day}T00:00:00+09:00`) - (range === "5d" ? 4 * 86_400_000 : 0);
    const end = Date.parse(series?.endAt);
    if (!series || series.symbol !== symbol || series.interval !== (range === "1d" ? "1m" : "30m") ||
      !/^(?:[A-Z]{3}|GBp)$/.test(series.currency) || Date.parse(series.startAt) !== start ||
      !Number.isFinite(end) || end < start || end >= Date.parse(`${day}T00:00:00+09:00`) + 86_400_000 ||
      end > Date.now() || (end - start) % step !== 0 || !Array.isArray(series.points) ||
      series.points.length !== (end - start) / step + 1 || series.points.some((p, index) =>
        !p || Date.parse(p.at) !== start + index * step || (p.close !== null &&
          (!Number.isFinite(p.close) || p.close <= 0 || !p.sourceAt || !Number.isFinite(Date.parse(p.sourceAt)) || Date.parse(p.sourceAt) > Date.parse(p.at)))))
      throw new Error("시간별 시세의 종목·통화·시각을 확인하지 못했습니다.");
    return series;
  }, { signal, ttlMs: 60_000 });
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
  return recoverableRequest(`daily-fx:${currency}:${start}:${end}`, `${currency}/KRW 과거 환율 조회`, async (s) => {
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
  if (date && date !== fxToday())
    return (await getDailyFxHistory(normalized, date, date, signal)).points[0].close;
  const quote = await getQuote(symbol, signal);
  // A carried valuation may keep a balance visible, but is not today's trade FX.
  if (quote.fx?.valuationOnly)
    throw new Error(`${normalized}/KRW 현재 환율을 확인하지 못했습니다. 최근 확인 환율은 평가액에만 사용할 수 있습니다.`);
  return quote.price;
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
