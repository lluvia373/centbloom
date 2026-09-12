import type { MoversResult } from "./movers-model";
import type { MarketStory } from "./news-model";

export interface NewsFeed {
  stories: MarketStory[];
  partial: boolean;
  stale?: boolean;
}
export function selectNewsSymbols(lists: MoversResult[]): string[] {
  return [...new Set(lists.flatMap((list) => list.quotes.slice(0, 3).map((quote) => quote.symbol)))];
}
/** Only news explicitly associated with selected stocks, newest first within 72 hours. */
export function mergeTrendingNews(groups: MarketStory[][], symbols: string[], now = Date.now(), names: Record<string, string> = {}): MarketStory[] {
  const targets = new Set(symbols);
  const direct = (story: MarketStory) => {
    const words = new Set(story.title.toLowerCase().split(/[^a-z0-9]+/));
    return story.symbols.some((symbol) => {
      if (!targets.has(symbol)) return false;
      if (words.has(symbol.toLowerCase())) return true;
      const brand = names[symbol]?.toLowerCase().split(/[^a-z0-9]+/)[0];
      return !!brand && brand.length >= 4 && !["american", "united", "first", "global"].includes(brand) && words.has(brand);
    });
  };
  const bucket = (story: MarketStory) => Math.floor(Math.max(0, now - Date.parse(story.publishedAt)) / 86400_000);
  const urls = new Set<string>();
  const titles = new Set<string>();
  return groups.flat()
    .filter((story) => {
      const time = Date.parse(story.publishedAt);
      return Number.isFinite(time) && time <= now + 300_000 && now - time <= 72 * 3600_000
        && story.symbols.some((symbol) => targets.has(symbol));
    })
    .sort((a, b) => bucket(a) - bucket(b) || Number(direct(b)) - Number(direct(a)) || b.publishedAt.localeCompare(a.publishedAt))
    .filter((story) => {
      const title = story.title.trim().replace(/\s+/g, " ").toLowerCase();
      if (urls.has(story.url) || titles.has(title)) return false;
      urls.add(story.url);
      titles.add(title);
      return true;
    }).slice(0, 40);
}
