import { createRequestCache } from "@/shared/async/request-cache";
import { selectChangeStory, type ResearchedMarketChange } from "../change-research";
import { fetchMarketChanges } from "./market-changes";
import { fetchCompanyNews } from "./news";
import { createNewsTitleTranslator } from "./translation-provider";
import { CHANGES_KEY, CHANGES_REFRESH_MS, CHANGES_MAX_AGE_MS, usableChanges, type PreparedChanges } from "./prepared-changes";
import { selectMarketChanges } from "../market-changes";

type Bindings = Pick<WorkerBindings, "NEWS_CACHE" | "NEWS_AI">;
const jobs = createRequestCache({ concurrency: 1, maxEntries: 2 });

export function refreshPreparedChanges(env: Bindings, { force = false, timeoutMs = 25_000 } = {}) {
  return jobs.request(CHANGES_KEY, async signal => {
    const existing = usableChanges(await env.NEWS_CACHE.get(CHANGES_KEY, "json"));
    if (!force && existing && Date.now() - existing.preparedAt < CHANGES_REFRESH_MS) return;
    if (await env.NEWS_CACHE.get("changes-failure:" + CHANGES_KEY)) return;
    let published = false;
    try {
      const candidates = await fetchMarketChanges(signal, env.NEWS_CACHE, Math.max(1, timeoutMs - 12_000));
      signal.throwIfAborted();
      const ready: ResearchedMarketChange[] = candidates.items.map(item => {
        const prior = existing?.feed.items.find(previous => previous.quote.symbol === item.quote.symbol)?.story;
        return { ...item, story: prior ? selectChangeStory(item, [prior]) : null };
      });
      if (candidates.partial && !ready.length) {
        throw new Error("Change research incomplete");
      }
      const preparedAt = Date.now();
      const snapshot: PreparedChanges = { version: 2, preparedAt, feed: { ...candidates,
        expiresAt: preparedAt + CHANGES_MAX_AGE_MS, items: ready } };
      // Publish numerical evidence before optional news/translation. Neither can hide a stock.
      const numericalSnapshot = JSON.stringify(snapshot);
      await env.NEWS_CACHE.put(CHANGES_KEY, numericalSnapshot, { expirationTtl: 30 * 60 });
      published = true;
      const publishedAt = Date.now();
      const newsSignal = AbortSignal.any([signal, AbortSignal.timeout(5_000)]);
      const selected = selectMarketChanges(ready, undefined, 6);
      let next = 0;
      await Promise.all(Array.from({ length: 2 }, async () => {
        while (!newsSignal.aborted && next < selected.length) {
          const item = selected[next++];
          try {
            const news = await fetchCompanyNews(item.quote.symbol, item.quote.name, newsSignal);
            const target = ready.find(candidate => candidate.quote.symbol === item.quote.symbol)!;
            target.story = selectChangeStory(item, news.stories) ?? target.story;
          } catch { /* News is supplementary; keep independently checked numerical facts. */ }
        }
      }));
      const withStories = ready.filter(item => item.story);
      if (withStories.length && !signal.aborted) {
        try {
          const translate = createNewsTitleTranslator(env.NEWS_AI, env.NEWS_CACHE);
          const stories = await translate(withStories.map(item => item.story!), signal, 1_000);
          withStories.forEach((item, index) => { item.story = stories[index] ?? item.story; });
        } catch { /* Original headlines remain usable. */ }
      }
      signal.throwIfAborted();
      const enrichedSnapshot = JSON.stringify(snapshot);
      if (enrichedSnapshot !== numericalSnapshot) {
        // KV permits one write per key per second. This is background work, not a UI delay.
        const remaining = 1100 - (Date.now() - publishedAt);
        if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
        signal.throwIfAborted();
        await env.NEWS_CACHE.put(CHANGES_KEY, enrichedSnapshot, { expirationTtl: 30 * 60 });
      }
    } catch (error) {
      if (published) return; // Optional enrichment cannot invalidate a published numerical snapshot.
      await env.NEWS_CACHE.put("changes-failure:" + CHANGES_KEY, "1", { expirationTtl: 60 });
      throw error;
    }
  }, { ttlMs: 30_000, timeoutMs });
}
