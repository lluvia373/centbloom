import { getCloudflareContext } from "@opennextjs/cloudflare";
import { after, connection } from "next/server";
import { cache } from "react";
import { refreshPreparedNews } from "./news-refresh";
import { newsKey, usableNews, NEWS_REFRESH_MS } from "./prepared-news";
import { validSymbol } from "./provider";

declare global {
  interface CloudflareEnv {
    NEWS_CACHE: WorkerBindings["NEWS_CACHE"];
    NEWS_AI: WorkerBindings["NEWS_AI"];
  }
}

/** The render/HTTP path reads prepared data only; Yahoo and AI run after it finishes. */
export const readPreparedNews = cache(async (symbol?: string) => {
  await connection();
  if (symbol && !validSymbol(symbol)) return null;
  const { env } = await getCloudflareContext({ async: true });
  if (!env.NEWS_CACHE) throw new Error("News storage unavailable");
  const snapshot = usableNews(await env.NEWS_CACHE.get(newsKey(symbol), "json"), symbol);
  if (symbol || !snapshot || Date.now() - snapshot.preparedAt >= NEWS_REFRESH_MS) {
    after(async () => {
      try { await refreshPreparedNews(env, symbol, { recordDemand: true }); }
      catch { console.warn("news_refresh_failed", { feed: symbol || "trending" }); }
    });
  }
  if (!snapshot && await env.NEWS_CACHE.get("news-failure:" + newsKey(symbol)))
    throw new Error("News collection unavailable");
  return snapshot?.feed ?? null;
});

export async function initialNews(symbol?: string) {
  try { return await readPreparedNews(symbol); }
  catch { return null; }
}
