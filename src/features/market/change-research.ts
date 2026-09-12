import type { MarketChange, MarketChangesFeed } from "./market-changes";
import type { MarketStory } from "./news-model";
import { normalizeNews } from "./news-model";

export interface ResearchedMarketChange extends MarketChange { story: MarketStory }
export interface ResearchedChangesFeed extends Omit<MarketChangesFeed, "items"> { items: ResearchedMarketChange[]; expiresAt: number }

export function companySearchName(name: string): string {
  return name.replace(/\b(?:incorporated|inc|corporation|corp|limited|ltd|plc)\b\.?/gi, "")
    .replace(/\bclass\s+[a-z]\b.*$/i, "").replace(/[,]+/g, " ").replace(/\s+/g, " ").trim();
}
const words = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const commonNames = new Set(["the", "global", "united", "first", "new", "american", "national", "advanced", "digital", "international", "quantum", "energy", "health", "financial", "life", "super", "micro"]);
const commonTickers = new Set(["A", "I", "T", "AI", "ON", "IT", "ALL", "NOW", "FOR", "ARE", "CAN", "BE", "AN"]);
function mentionsCompany(title: string, item: MarketChange): boolean {
  const symbol = item.quote.symbol.toUpperCase();
  const tokens: string[] = title.match(/[A-Za-z0-9.^=_-]+/g) ?? [];
  if (!commonTickers.has(symbol) && tokens.includes(symbol)) return true;
  if (title.includes("(" + symbol + ")") || title.includes(":" + symbol) || title.includes(": " + symbol)) return true;
  const name = words(companySearchName(item.quote.name)).replace(/^the /, "");
  if (!name || name === words(symbol)) return false;
  const headline = " " + words(title) + " ";
  if (headline.includes(" " + name + " ")) return true;
  const first = name.split(" ")[0];
  return first.length >= 4 && !commonNames.has(first) && headline.includes(" " + first + " ");
}
// These are headline relevance checks, not verification of a price-move cause or article body.
const event = /\b(earnings|revenue|results|guidance|forecast|trial|clinical|preclinical|fda|approval|approves?|approved|data|abstracts?|conference|launch\w*|announc\w*|present\w*|report\w*|deal|contract|partner\w*|acquir\w*|acquisition|merger|buyout|offer\w*|financ\w*|funding|capital|shares|stake|stakes|raises?|raised|cuts?|cut|surge\w*|jump\w*|plunge\w*|fall\w*|fell|drop\w*|rall\w*|climb\w*|slid\w*|rose|rise\w*|gain\w*|loss\w*|lawsuit|investigat\w*|settle\w*|bankrupt\w*|recall\w*|dividend|buyback|split|resign\w*|appoint\w*|ceo|cfo|upgrade\w*|downgrade\w*)\b/i;
const opinion = /\b(should you|stocks? to buy|best stocks?|top \d+|millionaire|worth buying|undervalued|overvalued|is it too late|before you buy|could.*(?:double|triple)|price prediction)\b/i;
const roundup = /\b(premarket|pre-market|futures|stocks? to watch|stocks? in focus)\b/i;

/** A recent, directly associated event headline. Absence means no representative card. */
export function selectChangeStory(item: MarketChange, stories: MarketStory[], now = Date.now()): MarketStory | null {
  const quotedAt = Date.parse(item.quote.quotedAt ?? "");
  if (!Number.isFinite(quotedAt)) return null;
  const candidates = stories.flatMap(story => {
    const [clean] = normalizeNews([{ title: story.title, link: story.url, publisher: story.publisher,
      providerPublishTime: story.publishedAt, relatedTickers: story.symbols }], now);
    if (!clean || !clean.symbols.includes(item.quote.symbol) || !clean.title.trim() || !clean.publisher.trim()) return [];
    const time = Date.parse(clean.publishedAt);
    if (time < quotedAt - 72 * 3600_000 || time > quotedAt + 24 * 3600_000 || time > now
      || !mentionsCompany(clean.title, item) || !event.test(clean.title)
      || opinion.test(clean.title) || roundup.test(clean.title) || /[?？]\s*$/.test(clean.title)) return [];
    return [{ ...clean, ...(typeof story.titleKo === "string" ? { titleKo: story.titleKo } : {}) }];
  });
  // Prefer the closest dated material, without claiming it explains the movement.
  candidates.sort((a, b) => Math.abs(Date.parse(a.publishedAt) - quotedAt) - Math.abs(Date.parse(b.publishedAt) - quotedAt));
  return candidates[0] ?? null;
}
