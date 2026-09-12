import { createRequestCache } from "@/shared/async/request-cache";
import { fetchNews } from "./news";
import { fetchTrendingNews } from "./trending-news";
import { createNewsTitleTranslator } from "./translation-provider";
import { newsKey, usableNews, NEWS_REFRESH_MS, type PreparedNews } from "./prepared-news";

type NewsBindings = Pick<WorkerBindings, "NEWS_CACHE" | "NEWS_AI">;
// Bound provider/AI work, without holding a user response open.
const jobs = createRequestCache({ concurrency: 2, maxEntries: 128 });
export function refreshPreparedNews(env: NewsBindings, symbol?: string, { recordDemand = false, force = false, timeoutMs = 25_000 } = {}) {
  return jobs.request(newsKey(symbol), async (signal) => {
    const key = newsKey(symbol);
    if (symbol && recordDemand) {
      const demandKey = "news-demand:" + symbol;
      const lastVisit = Number(await env.NEWS_CACHE.get(demandKey));
      if (!lastVisit || Date.now() - lastVisit >= NEWS_REFRESH_MS) {
        const requestedAt = Date.now();
        await env.NEWS_CACHE.put(demandKey, String(requestedAt), {
          expirationTtl: 86400, metadata: { requestedAt },
        });
      }
    }
    const existing = usableNews(await env.NEWS_CACHE.get(key, "json"), symbol);
    if (!force && existing && Date.now() - existing.preparedAt < NEWS_REFRESH_MS) return;
    if (await env.NEWS_CACHE.get("news-failure:" + key)) return;
    try {
      const feed = symbol ? { stories: await fetchNews(symbol, signal), partial: false }
        : await fetchTrendingNews(signal);
      const translate = createNewsTitleTranslator(env.NEWS_AI, env.NEWS_CACHE);
      const stories = await translate(feed.stories, signal, Math.max(1, Math.min(80_000, timeoutMs - 5_000)));
      signal.throwIfAborted();
      // A failed partial collection must not replace a healthy list with nothing.
      if (feed.partial && !stories.length && existing?.feed.stories.length) return;
      const snapshot: PreparedNews = { version: 1, preparedAt: Date.now(), feed: { ...feed, stories } };
      await env.NEWS_CACHE.put(key, JSON.stringify(snapshot), { expirationTtl: 6 * 3600 });
    } catch (error) {
      await env.NEWS_CACHE.put("news-failure:" + key, "1", { expirationTtl: 60 });
      throw error;
    }
  }, { ttlMs: 30_000, timeoutMs });
}

export async function refreshScheduledNews(env: NewsBindings) {
  const [home] = await Promise.allSettled([refreshPreparedNews(env, undefined, { force: true, timeoutMs: 90_000 })]);
  // Refresh recently viewed symbols; never try to collect the entire stock market.
  const demand = await env.NEWS_CACHE.list<{ requestedAt: number }>({ prefix: "news-demand:", limit: 1000 });
  const symbols = demand.keys.sort((a, b) => (b.metadata?.requestedAt ?? 0) - (a.metadata?.requestedAt ?? 0))
    .slice(0, 20).map((key) => key.name.slice("news-demand:".length));
  const results: PromiseSettledResult<void>[] = [];
  // Start timeouts when each pair starts, not while twenty symbols wait in a queue.
  for (let index = 0; index < symbols.length; index += 2) {
    results.push(...await Promise.allSettled(symbols.slice(index, index + 2)
      .map((symbol) => refreshPreparedNews(env, symbol, { force: true, timeoutMs: 70_000 }))));
  }
  if (home.status === "rejected") throw home.reason;
  if (results.some((result) => result.status === "rejected"))
    console.warn("news_refresh_partial", { failed: results.filter((result) => result.status === "rejected").length });
}
