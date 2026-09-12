import { changeKinds, marketSessionDate, type MarketChange } from "../market-changes";
import { selectChangeStory } from "../change-research";
import type { MoverQuote } from "../movers-model";
import type { WatchedSessionSnapshot, WatchedStockReport } from "../watched-report";

export const WATCHED_REFRESH_MS = 5 * 60_000;
export const WATCHED_MAX_AGE_MS = 30 * 60_000;
export const WATCHED_HISTORY_MS = 7 * 86400_000;
export const WATCHED_DEMAND_PREFIX = "watched-demand:v1:us:";
export const watchedReportKey = (symbol: string) => "watched-report:v1:us:" + symbol;
export const watchedFailureKey = (symbol: string) => "watched-failure:v1:us:" + symbol;
export const watchedHistoryKey = (symbol: string, date: string) => "watched-history:v1:us:" + symbol + ":" + date;
export interface PreparedWatchedReport { version: 1; preparedAt: number; report: WatchedStockReport }
export interface StoredWatchedSession extends WatchedSessionSnapshot { version: 1; quotedAt: string }
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

function usableQuote(value: unknown, symbol: string, now: number): value is MoverQuote {
  if (!value || typeof value !== "object") return false;
  const quote = value as Partial<MoverQuote>;
  const time = Date.parse(quote.quotedAt ?? "");
  return quote.symbol === symbol && typeof quote.name === "string" && !!quote.name.trim()
    && finite(quote.price) && quote.price > 0 && finite(quote.change) && finite(quote.changePercent)
    && quote.currency === "USD" && Number.isFinite(time) && time <= now + 300_000 && now - time <= WATCHED_HISTORY_MS
    && (quote.volume === undefined || finite(quote.volume) && quote.volume >= 0)
    && (quote.averageDailyVolume3Month === undefined || finite(quote.averageDailyVolume3Month) && quote.averageDailyVolume3Month > 0);
}

function usableChange(value: unknown, quote: MoverQuote): value is MarketChange {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<MarketChange>;
  if (item.sessionDate !== marketSessionDate(quote.quotedAt) || !item.quote
    || item.quote.symbol !== quote.symbol || item.quote.quotedAt !== quote.quotedAt || item.quote.price !== quote.price
    || item.quote.change !== quote.change || item.quote.changePercent !== quote.changePercent
    || !Array.isArray(item.signals) || !item.signals.length || !item.signals.every(signal => signal
      && changeKinds.includes(signal.kind) && finite(signal.value) && finite(signal.baseline) && signal.baseline > 0
      && finite(signal.ratio) && signal.ratio > 0)) return false;
  return !item.context || Array.isArray(item.context.recentMoves) && item.context.recentMoves.every(move => move
    && typeof move.date === "string" && validDate(move.date) && move.date < item.sessionDate! && finite(move.percent))
    && (item.context.previousMaxMove === undefined || finite(item.context.previousMaxMove));
}

function usablePrevious(value: unknown, sessionDate: string): value is WatchedSessionSnapshot {
  if (!value || typeof value !== "object") return false;
  const previous = value as Partial<WatchedSessionSnapshot>;
  return typeof previous.sessionDate === "string" && validDate(previous.sessionDate) && previous.sessionDate < sessionDate
    && Date.parse(sessionDate) - Date.parse(previous.sessionDate) <= WATCHED_HISTORY_MS
    && finite(previous.price) && previous.price > 0 && finite(previous.changePercent);
}

/** A five-minute refresh never becomes yesterday: require the chart's exact prior session. */
export function priorWatchedSession(value: unknown, previousSessionDate: string | null,
  currentSessionDate: string, now = Date.now()): WatchedSessionSnapshot | null {
  if (!previousSessionDate || !usablePrevious(value, currentSessionDate)) return null;
  const row = value as StoredWatchedSession;
  const time = Date.parse(row.quotedAt ?? "");
  if (row.version !== 1 || row.sessionDate !== previousSessionDate || marketSessionDate(row.quotedAt) !== row.sessionDate
    || !Number.isFinite(time) || time > now + 300_000 || now - time > WATCHED_HISTORY_MS) return null;
  return { sessionDate: row.sessionDate, price: row.price, changePercent: row.changePercent };
}

/** Read only a coherent quote/article pair and its separately retained prior-day record. */
export function usableWatchedReport(value: unknown, symbol: string, now = Date.now()): PreparedWatchedReport | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<PreparedWatchedReport>;
  if (row.version !== 1 || !finite(row.preparedAt) || row.preparedAt > now + 300_000
    || now - row.preparedAt >= WATCHED_MAX_AGE_MS || !row.report || !usableQuote(row.report.quote, symbol, now)) return null;
  const { quote, change, previous, story } = row.report;
  const sessionDate = marketSessionDate(quote.quotedAt)!;
  if (change !== null && !usableChange(change, quote)) return null;
  if (previous !== null && !usablePrevious(previous, sessionDate)) return null;
  if (story !== null && (!story || !Array.isArray(story.symbols))) return null;
  const selected = story ? selectChangeStory({ quote, sessionDate, signals: [] }, [story], now) : null;
  if (story && !selected) return null;
  return { version: 1, preparedAt: row.preparedAt, report: {
    quote, change, story: selected, previous, expiresAt: row.preparedAt + WATCHED_MAX_AGE_MS,
  } };
}

export async function readPreparedWatchedReport(storage: WorkerBindings["NEWS_CACHE"], symbol: string) {
  return usableWatchedReport(await storage.get(watchedReportKey(symbol), "json"), symbol);
}
