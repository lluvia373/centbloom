import {
  marketForSymbol,
  marketSearchSymbols,
  matchingStocks,
  type MarketFilter,
} from "@/lib/markets";
import type { StockSearchResult } from "@/lib/types";
import { MarketError, providerRequests, yahoo } from "./provider";
export function fetchSearch(
  query: string,
  market: MarketFilter,
  signal?: AbortSignal,
): Promise<StockSearchResult[]> {
  return providerRequests.request(
    JSON.stringify(["search", query, market]),
    async (signal) => {
      const localMatches = matchingStocks(query, market);
      try {
        const queries = marketSearchSymbols(query, market);
        const responses = await Promise.allSettled(
          queries.map((value) =>
            yahoo.search(
              value,
              { quotesCount: 20, newsCount: 0 },
              { fetchOptions: { signal } },
            ),
          ),
        );
        if (
          responses.every((result) => result.status === "rejected") &&
          !localMatches.length
        )
          throw new Error("Search unavailable");

        const stocks: StockSearchResult[] = responses
          .flatMap((result) =>
            result.status === "fulfilled" ? result.value.quotes : [],
          )
          .filter(
            (
              q,
            ): q is typeof q & {
              symbol: string;
              shortname?: string;
              longname?: string;
            } => "symbol" in q && typeof q.symbol === "string",
          )
          .map((q) => ({
            symbol: q.symbol,
            name: q.shortname ?? q.longname ?? q.symbol,
            exchange: String(
              "exchDisp" in q
                ? (q.exchDisp ?? q.exchange ?? "")
                : (q.exchange ?? ""),
            ),
            type: String(q.quoteType ?? "EQUITY"),
          }));

        const unique = new Map<string, StockSearchResult>();
        [...localMatches, ...stocks].forEach((stock) => {
          if (
            (market === "all" || marketForSymbol(stock.symbol) === market) &&
            !unique.has(stock.symbol)
          ) {
            unique.set(stock.symbol, stock);
          }
        });
        return [...unique.values()].slice(0, 20);
      } catch {
        if (localMatches.length) return localMatches;
        throw new MarketError("검색에 실패했습니다.");
      }
    },
    { signal, ttlMs: 60000 },
  );
}
