import { knownMarketDelay } from "@/lib/markets";
import type { StockQuote } from "@/lib/types";
import { MarketError, providerRequests, yahoo } from "./provider";
export function fetchQuote(
  symbol: string,
  signal?: AbortSignal,
): Promise<StockQuote> {
  return providerRequests.request(
    "quote:" + symbol,
    async (signal) => {
      const quote = await yahoo.quote(
        symbol,
        {
          fields: [
            "symbol",
            "shortName",
            "longName",
            "regularMarketPrice",
            "regularMarketChange",
            "regularMarketChangePercent",
            "currency",
            "marketCap",
            "regularMarketVolume",
            "regularMarketDayHigh",
            "regularMarketDayLow",
            "fiftyTwoWeekHigh",
            "fiftyTwoWeekLow",
            "regularMarketPreviousClose",
            "fullExchangeName",
            "exchange",
            "marketState",
            "regularMarketTime",
            "exchangeDataDelayedBy",
            "quoteSourceName",
            "logoUrl",
          ],
        },
        { fetchOptions: { signal } },
      );
      const price = quote?.regularMarketPrice;

      if (
        !quote ||
        typeof price !== "number" ||
        !Number.isFinite(price) ||
        price <= 0 ||
        !quote.currency
      ) {
        throw new MarketError("종목을 찾을 수 없습니다.", 404);
      }

      const data: StockQuote = {
        symbol: quote.symbol ?? symbol,
        name: quote.shortName ?? quote.longName ?? symbol,
        price,
        change: quote.regularMarketChange ?? 0,
        changePercent: quote.regularMarketChangePercent ?? 0,
        currency: quote.currency!,
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
        delayMinutes:
          Math.max(
            knownMarketDelay(symbol) ?? 0,
            quote.exchangeDataDelayedBy ?? 0,
          ) || undefined,
        source: quote.quoteSourceName,
        logoUrl: quote.logoUrl,
      };

      return data;
    },
    { signal, ttlMs: 5000 },
  );
}
