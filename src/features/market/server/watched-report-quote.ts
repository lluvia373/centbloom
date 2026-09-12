import type { MoverQuote } from "../movers-model";
import { MarketError, providerRequests, validSymbol, yahoo } from "./provider";

export function watchedSymbol(value: string): string {
  const symbol = value.trim().toUpperCase();
  if (!validSymbol(symbol)) throw new MarketError("종목 기호를 확인해 주세요.", 400);
  return symbol;
}

/** Match the public US-equity comparison universe, with no invented missing values. */
export function normalizeWatchedQuote(value: unknown, symbol: string): MoverQuote {
  if (!value || typeof value !== "object") throw new MarketError("종목을 찾을 수 없습니다.", 404);
  const quote = value as Record<string, unknown>;
  if (quote.quoteType !== "EQUITY" || quote.region !== "US" || quote.currency !== "USD")
    throw new MarketError("현재 미국 주식의 자료를 제공합니다.", 422);
  const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
  const price = quote.regularMarketPrice, change = quote.regularMarketChange, percent = quote.regularMarketChangePercent;
  const rawTime = quote.regularMarketTime;
  const time = rawTime instanceof Date ? rawTime.getTime() : typeof rawTime === "number" ? rawTime * 1000 : NaN;
  if (quote.symbol !== symbol || !finite(price) || price <= 0 || !finite(change) || !finite(percent)
    || !Number.isFinite(time) || time <= 0 || time > Date.now() + 300_000 || Date.now() - time > 7 * 86400_000)
    throw new MarketError("종목의 비교 자료를 확인할 수 없습니다.", 502);
  return {
    symbol, name: typeof quote.shortName === "string" && quote.shortName.trim() ? quote.shortName
      : typeof quote.longName === "string" && quote.longName.trim() ? quote.longName : symbol,
    price, change, changePercent: percent, currency: "USD", quotedAt: new Date(time).toISOString(),
    fetchedAt: new Date().toISOString(),
    ...(finite(quote.regularMarketVolume) && quote.regularMarketVolume >= 0 ? { volume: quote.regularMarketVolume } : {}),
    ...(finite(quote.averageDailyVolume3Month) && quote.averageDailyVolume3Month > 0
      ? { averageDailyVolume3Month: quote.averageDailyVolume3Month } : {}),
    ...(typeof quote.fullExchangeName === "string" ? { exchange: quote.fullExchangeName } : {}),
    ...(typeof quote.marketState === "string" ? { marketState: quote.marketState } : {}),
    ...(typeof quote.quoteSourceName === "string" ? { source: quote.quoteSourceName } : {}),
    ...(finite(quote.exchangeDataDelayedBy) && quote.exchangeDataDelayedBy > 0 ? { delayMinutes: quote.exchangeDataDelayedBy } : {}),
    ...(typeof quote.logoUrl === "string" ? { logoUrl: quote.logoUrl } : {}),
  };
}

export function fetchWatchedQuote(symbol: string, signal?: AbortSignal): Promise<MoverQuote> {
  return providerRequests.request("watched-quote:us:" + symbol, async signal => {
    const quote = await yahoo.quote(symbol, { fields: [
      "symbol", "shortName", "longName", "quoteType", "region", "currency", "regularMarketPrice",
      "regularMarketChange", "regularMarketChangePercent", "regularMarketTime", "regularMarketVolume",
      "averageDailyVolume3Month", "fullExchangeName", "marketState", "exchangeDataDelayedBy", "quoteSourceName", "logoUrl",
    ] }, { fetchOptions: { signal } });
    return normalizeWatchedQuote(quote, symbol);
  }, { signal, ttlMs: 5_000 });
}
