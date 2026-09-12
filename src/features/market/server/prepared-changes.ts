import { changeKinds, marketSessionDate, type MarketChange } from "../market-changes";
import { selectChangeStory, type ResearchedChangesFeed } from "../change-research";

export const CHANGES_KEY = "market-changes:v1:us";
export const CHANGES_REFRESH_MS = 5 * 60_000;
export const CHANGES_MAX_AGE_MS = 30 * 60_000;
export interface PreparedChanges { version: 1; preparedAt: number; feed: ResearchedChangesFeed }
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function usableItem(value: unknown, now: number): value is ResearchedChangesFeed["items"][number] {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<MarketChange>;
  const quote = item.quote;
  if (!quote || typeof quote.symbol !== "string" || !/^[A-Za-z0-9.^=_-]{1,40}$/.test(quote.symbol)
    || typeof quote.name !== "string" || !finite(quote.price) || quote.price <= 0 || quote.currency !== "USD"
    || !finite(quote.change) || !finite(quote.changePercent) || typeof quote.quotedAt !== "string") return false;
  const time = Date.parse(quote.quotedAt);
  if (!Number.isFinite(time) || time > now + 300_000 || now - time > 7 * 86400_000
    || item.sessionDate !== marketSessionDate(quote.quotedAt)) return false;
  if (!Array.isArray(item.signals) || !item.signals.length || !item.signals.every(signal => signal
    && changeKinds.includes(signal.kind) && finite(signal.value) && finite(signal.baseline) && signal.baseline > 0
    && finite(signal.ratio) && signal.ratio > 0)) return false;
  if (item.context && (!Array.isArray(item.context.recentMoves) || !item.context.recentMoves.every(move => move
    && typeof move.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(move.date) && move.date < item.sessionDate!
    && finite(move.percent)) || (item.context.previousMaxMove !== undefined && !finite(item.context.previousMaxMove)))) return false;
  return true;
}

/** Storage is versioned and rechecked; old quotes and malformed/irrelevant articles are not served. */
export function usableChanges(value: unknown, now = Date.now()): PreparedChanges | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<PreparedChanges>;
  if (row.version !== 1 || !finite(row.preparedAt) || row.preparedAt > now + 300_000
    || now - row.preparedAt > CHANGES_MAX_AGE_MS || !Array.isArray(row.feed?.items)
    || !finite(row.feed.examined) || !finite(row.feed.historyUnavailable) || typeof row.feed.partial !== "boolean") return null;
  const seen = new Set<string>();
  const items = row.feed.items.slice(0, 9).flatMap(item => {
    if (!usableItem(item, now) || !item.story || !Array.isArray(item.story.symbols) || seen.has(item.quote.symbol)) return [];
    const story = selectChangeStory(item, [item.story], now);
    if (!story) return [];
    seen.add(item.quote.symbol);
    return [{ ...item, story }];
  });
  if (row.feed.items.length && !items.length) return null;
  return { version: 1, preparedAt: row.preparedAt, feed: { ...row.feed, items, expiresAt: row.preparedAt + CHANGES_MAX_AGE_MS } };
}
