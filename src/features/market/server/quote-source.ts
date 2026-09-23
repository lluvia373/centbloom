import { knownMarketDelay, stockDisplayName } from "@/lib/markets";
import type { StockQuote } from "@/lib/types";
import type { Quote, QuoteField } from "yahoo-finance2/modules/quote";
import { MarketError, providerRequests, validSymbol, yahoo } from "./provider";
import { fxPair } from "../fx";
import { fetchFxQuote } from "./fx-market";
import { mapLimited } from "@/shared/async/pool";
const fields: QuoteField[] = [
  "symbol", "shortName", "longName", "regularMarketPrice", "regularMarketChange",
  "regularMarketChangePercent", "currency", "marketCap", "regularMarketVolume",
  "regularMarketDayHigh", "regularMarketDayLow", "fiftyTwoWeekHigh", "fiftyTwoWeekLow",
  "regularMarketPreviousClose", "fullExchangeName", "exchange", "marketState",
  "regularMarketTime", "exchangeDataDelayedBy", "quoteSourceName", "logoUrl",
];

export interface QuoteBatch {
  quotes: Record<string, StockQuote>;
  errors: Record<string, { message: string; status: number }>;
}

export function quoteBatchSymbols(raw: string | null): string[] {
  const symbols = [...new Set((raw ?? "").split(",").map(value => value.trim().toUpperCase()))].sort();
  if (!symbols.length || symbols.length > 50 || symbols.some(symbol =>
    !validSymbol(symbol) || fxPair(symbol) || symbol.endsWith("=X")))
    throw new MarketError("시세 종목은 환율을 제외하고 1~50개까지 조회할 수 있습니다.", 400);
  return symbols;
}

function normalizeQuote(quote: Quote | undefined, symbol: string): StockQuote {
  const price = quote?.regularMarketPrice;
  if (!quote || quote.symbol !== symbol || typeof price !== "number" ||
    !Number.isFinite(price) || price <= 0 || !quote.currency)
    throw new MarketError("종목을 찾을 수 없습니다.", 404);
  return {
    symbol,
    name: stockDisplayName(symbol, quote.longName, quote.shortName),
    price,
    change: quote.regularMarketChange ?? 0,
    changePercent: quote.regularMarketChangePercent ?? 0,
    currency: quote.currency,
    marketCap: quote.marketCap,
    volume: quote.regularMarketVolume,
    dayHigh: quote.regularMarketDayHigh,
    dayLow: quote.regularMarketDayLow,
    fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
    previousClose: quote.regularMarketPreviousClose,
    exchange: quote.fullExchangeName ?? quote.exchange,
    marketState: quote.marketState,
    quotedAt: quote.regularMarketTime?.toISOString(),
    fetchedAt: new Date().toISOString(),
    delayMinutes: Math.max(knownMarketDelay(symbol) ?? 0, quote.exchangeDataDelayedBy ?? 0) || undefined,
    source: quote.quoteSourceName,
    logoUrl: quote.logoUrl,
  };
}

// Reject the cache entry on partial failure, then return its per-symbol result.
// A missing provider row must be retried rather than stored as a successful quote.
class PartialQuotes extends Error {
  constructor(public result: QuoteBatch) { super("Some quotes are unavailable"); }
}

export async function fetchProviderQuotes(symbols: string[], signal?: AbortSignal): Promise<QuoteBatch> {
  const requested = quoteBatchSymbols(symbols.join(","));
  try {
    return await providerRequests.request(
      "quotes:" + requested.join(","),
      async signal => {
        const rows = await yahoo.quote(requested, { fields }, { fetchOptions: { signal } });
        const bySymbol = new Map(rows.map(quote => [quote.symbol, quote]));
        const result: QuoteBatch = { quotes: {}, errors: {} };
        for (const symbol of requested) {
          try { result.quotes[symbol] = normalizeQuote(bySymbol.get(symbol), symbol); }
          catch (error) {
            if (!(error instanceof MarketError)) throw error;
            result.errors[symbol] = { message: error.message, status: error.status };
          }
        }
        if (Object.keys(result.errors).length) throw new PartialQuotes(result);
        return result;
      },
      { signal, ttlMs: 5_000 },
    );
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof PartialQuotes) return error.result;
    throw error;
  }
}

export function fetchProviderQuote(
  symbol: string,
  signal?: AbortSignal,
): Promise<StockQuote> {
  symbol = symbol.trim().toUpperCase();
  if (fxPair(symbol)) return fetchFxQuote(symbol, signal);
  return providerRequests.request(
    "quote:" + symbol,
    async (signal) => {
      const quote = await yahoo.quote(symbol, { fields }, { fetchOptions: { signal } });
      return normalizeQuote(quote, symbol);
    },
    { signal, ttlMs: 5000 },
  );
}

/** Public prices only; the coordinator never receives accounts or holdings. */
export async function loadPreparationQuotes(symbols: string[], signal: AbortSignal): Promise<QuoteBatch> {
  const stocks = symbols.filter(symbol => !fxPair(symbol));
  const currencies = symbols.filter(symbol => fxPair(symbol));
  const [stockResult, fxResults] = await Promise.all([
    stocks.length ? fetchProviderQuotes(stocks, signal) : { quotes: {}, errors: {} },
    mapLimited(currencies, 4, async symbol => {
      try { return { symbol, quote: await fetchProviderQuote(symbol, signal) }; }
      catch (error) {
        signal.throwIfAborted();
        if ((error as { status?: number; code?: number })?.status === 429 ||
          (error as { code?: number })?.code === 429) throw error;
        return { symbol, error: { message: "현재 환율을 확인하지 못했습니다.", status: 503 } };
      }
    }),
  ]);
  const result: QuoteBatch = { quotes: { ...stockResult.quotes }, errors: { ...stockResult.errors } };
  for (const row of fxResults) {
    if (row.quote) result.quotes[row.symbol] = row.quote;
    else if (row.error) result.errors[row.symbol] = row.error;
  }
  return result;
}
