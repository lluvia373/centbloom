import { createRequestCache } from "@/shared/async/request-cache";
import { moverKinds } from "../movers-model";
import { describeMarketChange, marketSessionDate, type MarketChangesFeed } from "../market-changes";
import { fetchMovers } from "./movers";
import { fetchChart } from "./chart";
import { MarketError } from "./provider";

const requests = createRequestCache({ concurrency: 2, maxEntries: 8 });

export function fetchMarketChanges(signal?: AbortSignal): Promise<MarketChangesFeed> {
  // Orchestration is outside the provider pool: its children use the existing shared queue.
  return requests.request("market-changes:us", async signal => {
    const lists = await Promise.allSettled(moverKinds.map(kind => fetchMovers(kind, signal)));
    signal.throwIfAborted();
    const successful = lists.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
    if (!successful.length) throw new MarketError("변화를 비교할 시세를 가져오지 못했습니다.");
    const quotes = [...new Map(successful.flatMap(list => list.quotes.slice(0, 3)).map(quote => [quote.symbol, quote])).values()];
    const rows = await Promise.all(quotes.map(async quote => {
      const date = marketSessionDate(quote.quotedAt);
      if (!date) return { item: null, failed: true };
      const start = new Date(Date.parse(date) - 60 * 86400_000).toISOString().slice(0, 10);
      const end = new Date(Date.parse(date) - 86400_000).toISOString().slice(0, 10);
      try {
        const history = await fetchChart(quote.symbol, "1mo", start, end, signal);
        return { item: describeMarketChange(quote, history.points), failed: false };
      } catch {
        signal.throwIfAborted();
        return { item: describeMarketChange(quote, []), failed: true };
      }
    }));
    signal.throwIfAborted();
    return {
      items: rows.flatMap(row => row.item ? [row.item] : []), examined: quotes.length,
      historyUnavailable: rows.filter(row => row.failed).length,
      partial: lists.some(result => result.status === "rejected") || rows.some(row => row.failed),
    };
  }, { signal, ttlMs: 60_000, timeoutMs: 50_000 });
}
