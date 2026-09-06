import { normalizeNews } from "../news-model";
import { providerRequests, yahoo } from "./provider";

export function fetchNews(symbol: string, signal?: AbortSignal) {
  return providerRequests.request(
    "news:" + symbol,
    async (signal) => {
      const response = await yahoo.search(
        symbol,
        { quotesCount: 0, newsCount: 20 },
        { fetchOptions: { signal } },
      );
      // Search can return unrelated stories; require the provider's explicit ticker association.
      const related = response.news.filter((row) => row.relatedTickers?.includes(symbol));
      return normalizeNews(related).map((story) => ({
        ...story, symbols: [symbol, ...story.symbols.filter((ticker) => ticker !== symbol)].slice(0, 3),
      }));
    },
    { signal, ttlMs: 45_000 },
  );
}
