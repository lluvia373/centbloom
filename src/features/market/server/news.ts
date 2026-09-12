import { normalizeNews } from "../news-model";
import { companySearchName } from "../change-research";
import { providerRequests, yahoo } from "./provider";

function searchNews(symbol: string, query: string, signal?: AbortSignal) {
  return providerRequests.request(
    "news:" + symbol + ":" + query,
    async (signal) => {
      const response = await yahoo.search(query, { quotesCount: 0, newsCount: 20 }, { fetchOptions: { signal } });
      // Association is checked before normalization truncates the provider's ticker list.
      const related = response.news.filter((row) => row.relatedTickers?.includes(symbol))
        .map(row => ({ ...row, relatedTickers: [symbol, ...(row.relatedTickers ?? []).filter(ticker => ticker !== symbol)] }));
      return normalizeNews(related);
    },
    { signal, ttlMs: 45_000 },
  );
}
export function fetchNews(symbol: string, signal?: AbortSignal) {
  return searchNews(symbol, symbol, signal);
}

/** Company-name search finds announcements that an ambiguous ticker query can miss. */
export async function fetchCompanyNews(symbol: string, name: string, signal?: AbortSignal) {
  const queries = [...new Set([symbol, companySearchName(name)].filter(Boolean))];
  const results = await Promise.allSettled(queries.map(query => searchNews(symbol, query, signal)));
  signal?.throwIfAborted();
  const successful = results.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
  if (!successful.length) throw new Error("Company news unavailable");
  return { stories: [...new Map(successful.flat().map(story => [story.url, story])).values()],
    partial: results.some(result => result.status === "rejected") };
}
