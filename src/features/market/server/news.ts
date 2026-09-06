import { normalizeNews } from "../news-model";
import { providerRequests, yahoo } from "./provider";

export function fetchNews(symbol?: string, signal?: AbortSignal) {
  return providerRequests.request(
    "news:" + (symbol ?? "market"),
    async (signal) => {
      const response = await yahoo.search(
        symbol ?? "US stock market",
        { quotesCount: 0, newsCount: 20 },
        { fetchOptions: { signal } },
      );
      return normalizeNews(response.news);
    },
    { signal, ttlMs: 120_000 },
  );
}
