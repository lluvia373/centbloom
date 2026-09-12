import type { NewsFeed } from "../trending-news";
import { normalizeNews } from "../news-model";

export const NEWS_REFRESH_MS = 5 * 60_000;
export const NEWS_MAX_AGE_MS = 6 * 3600_000;
export const newsKey = (symbol?: string) => "news:v1:" + (symbol || "trending");
export interface PreparedNews { version: 1; preparedAt: number; feed: NewsFeed }

/** Recheck age and article URLs even when storage contains an old deployment's data. */
export function usableNews(value: unknown, symbol?: string, now = Date.now()): PreparedNews | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<PreparedNews>;
  if (row.version !== 1 || typeof row.preparedAt !== "number" || !Number.isFinite(row.preparedAt)
    || row.preparedAt > now + 300_000 || now - row.preparedAt > NEWS_MAX_AGE_MS
    || !Array.isArray(row.feed?.stories) || typeof row.feed.partial !== "boolean") return null;
  const stories = row.feed.stories.slice(0, symbol ? 20 : 40).flatMap((story) => {
    if (!story || typeof story !== "object" || !Array.isArray(story.symbols)) return [];
    const [clean] = normalizeNews([{ title: story.title, link: story.url, publisher: story.publisher,
      providerPublishTime: story.publishedAt, relatedTickers: story.symbols }], now);
    if (!clean || (symbol && !clean.symbols.includes(symbol))
      || (!symbol && now - Date.parse(clean.publishedAt) > 72 * 3600_000)) return [];
    return [{ ...clean, ...(typeof story.titleKo === "string" ? { titleKo: story.titleKo } : {}) }];
  });
  // A formerly non-empty list must not silently become a successful 'no news' response.
  if (row.feed.stories.length && !stories.length) return null;
  return { version: 1, preparedAt: row.preparedAt, feed: { stories,
    partial: row.feed.partial, stale: now - row.preparedAt > NEWS_REFRESH_MS * 2 } };
}
