import { createRequestCache } from "@/shared/async/request-cache";
import { moverKinds } from "../movers-model";
import { selectNewsSymbols, mergeTrendingNews, type NewsFeed } from "../trending-news";
import { fetchMovers } from "./movers";
import { fetchNews } from "./news";
import { MarketError } from "./provider";

// Orchestration must not occupy a slot in the provider pool it awaits.
const requests = createRequestCache({ concurrency: 2, maxEntries: 8 });
export function fetchTrendingNews(signal?: AbortSignal): Promise<NewsFeed> {
  return requests.request("trending-news:us", async (signal) => {
    const lists = await Promise.allSettled(moverKinds.map((kind) => fetchMovers(kind, signal)));
    signal.throwIfAborted();
    const successful = lists.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    if (!successful.length) throw new MarketError("종목 순위를 가져오지 못했습니다.");
    const symbols = selectNewsSymbols(successful);
    const groups = await Promise.allSettled(symbols.map((symbol) => fetchNews(symbol, signal)));
    signal.throwIfAborted();
    const fulfilled = groups.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    if (symbols.length && !fulfilled.length) throw new MarketError("종목 뉴스를 가져오지 못했습니다.");
    return {
      stories: mergeTrendingNews(fulfilled, symbols, Date.now(), Object.fromEntries(
        successful.flatMap((list) => list.quotes.map((quote) => [quote.symbol, quote.name])),
      )),
      partial: lists.some((result) => result.status === "rejected") || groups.some((result) => result.status === "rejected"),
    };
  }, { signal, ttlMs: 0, timeoutMs: 55_000 });
}
