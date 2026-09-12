import { createRequestCache } from "@/shared/async/request-cache";
import { selectChangeStory, type ResearchedMarketChange } from "../change-research";
import { fetchMarketChanges } from "./market-changes";
import { fetchCompanyNews } from "./news";
import { createNewsTitleTranslator } from "./translation-provider";
import { CHANGES_KEY, CHANGES_REFRESH_MS, CHANGES_MAX_AGE_MS, usableChanges, type PreparedChanges } from "./prepared-changes";

type Bindings = Pick<WorkerBindings, "NEWS_CACHE" | "NEWS_AI">;
const jobs = createRequestCache({ concurrency: 1, maxEntries: 2 });

export function refreshPreparedChanges(env: Bindings, { force = false, timeoutMs = 25_000 } = {}) {
  return jobs.request(CHANGES_KEY, async signal => {
    const existing = usableChanges(await env.NEWS_CACHE.get(CHANGES_KEY, "json"));
    if (!force && existing && Date.now() - existing.preparedAt < CHANGES_REFRESH_MS) return;
    if (await env.NEWS_CACHE.get("changes-failure:" + CHANGES_KEY)) return;
    try {
      const candidates = await fetchMarketChanges(signal);
      const researched = await Promise.allSettled(candidates.items.map(async item => {
        const news = await fetchCompanyNews(item.quote.symbol, item.quote.name, signal);
        return { item, story: selectChangeStory(item, news.stories), partial: news.partial };
      }));
      signal.throwIfAborted();
      const ready: ResearchedMarketChange[] = researched.flatMap(result => result.status === "fulfilled" && result.value.story
        ? [{ ...result.value.item, story: result.value.story }] : []);
      const partial = candidates.partial || researched.some(result => result.status === "rejected"
        || (result.status === "fulfilled" && result.value.partial));
      // A provider failure must not erase a previously useful result. Never mix old stories with new quotes.
      if (partial && !ready.length) {
        throw new Error("Change research incomplete");
      }
      const translate = createNewsTitleTranslator(env.NEWS_AI, env.NEWS_CACHE);
      const stories = await translate(ready.map(item => item.story), signal, Math.max(1, Math.min(80_000, timeoutMs - 5_000)));
      signal.throwIfAborted();
      const preparedAt = Date.now();
      const snapshot: PreparedChanges = { version: 1, preparedAt, feed: { ...candidates, partial, expiresAt: preparedAt + CHANGES_MAX_AGE_MS,
        items: ready.map((item, index) => ({ ...item, story: stories[index] })) } };
      await env.NEWS_CACHE.put(CHANGES_KEY, JSON.stringify(snapshot), { expirationTtl: 30 * 60 });
    } catch (error) {
      await env.NEWS_CACHE.put("changes-failure:" + CHANGES_KEY, "1", { expirationTtl: 60 });
      throw error;
    }
  }, { ttlMs: 30_000, timeoutMs });
}
