import { createRequestCache } from "@/shared/async/request-cache";
import { moverKinds, type MoverQuote } from "../movers-model";
import { consecutiveMarketSessions, describeMarketChange, marketSessionDate, type MarketChangesFeed } from "../market-changes";
import type { ChartPoint } from "@/lib/types";
import { fetchMovers } from "./movers";
import { fetchChart } from "./chart";
import { MarketError } from "./provider";

const requests = createRequestCache({ concurrency: 2, maxEntries: 8 });
export const CHANGE_RANKING_LIMIT = 250;
const HISTORY_KEY = "market-changes:history:v1:us";
type HistoryRow = { sessionDate: string; fetchedAt: number; points: ChartPoint[] };
type Storage = Pick<WorkerBindings["NEWS_CACHE"], "get" | "put">;

function cachedHistories(value: unknown, now: number): Map<string, HistoryRow> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return new Map();
  return new Map(Object.entries(value).filter((entry): entry is [string, HistoryRow] => {
    const [symbol, row] = entry;
    return /^[A-Za-z0-9.^=_-]{1,40}$/.test(symbol) && row && typeof row === "object"
      && typeof row.sessionDate === "string" && Number.isFinite(row.fetchedAt)
      && row.fetchedAt <= now && now - row.fetchedAt < 3600_000
      && Array.isArray(row.points) && row.points.length > 0 && row.points.length <= 21
      && row.points.every((point: ChartPoint) => /^\d{4}-\d{2}-\d{2}$/.test(point.date)
        && point.date < row.sessionDate && Number.isFinite(point.close) && point.close > 0);
  }));
}

export function fetchMarketChanges(signal?: AbortSignal, storage?: Storage, historyBudgetMs = 15_000): Promise<MarketChangesFeed> {
  // Orchestration is outside the provider pool: its children use the existing shared queue.
  return requests.request("market-changes:us", async signal => {
    const lists = await Promise.allSettled(moverKinds.map(kind => fetchMovers(kind, signal, CHANGE_RANKING_LIMIT)));
    signal.throwIfAborted();
    const successful = lists.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
    if (!successful.length) throw new MarketError("변화를 비교할 시세를 가져오지 못했습니다.");
    const quotes = [...new Map(successful.flatMap(list => list.quotes).map(quote => [quote.symbol, quote])).values()];
    const histories = cachedHistories(storage ? await storage.get(HISTORY_KEY, "json") : null, Date.now());
    const rows = new Map<string, Awaited<ReturnType<typeof fetchQuoteChange>>>();
    const pending: MoverQuote[] = [];
    for (const quote of quotes) {
      const row = histories.get(quote.symbol);
      const last = row?.points.at(-1);
      const previous = quote.price - quote.change;
      if (row?.sessionDate === marketSessionDate(quote.quotedAt) && last && previous > 0 && Math.abs(last.close / previous - 1) < 0.01) {
        rows.set(quote.symbol, { item: describeMarketChange(quote, row.points), failed: false, previousSessionDate: last.date });
      } else pending.push(quote);
    }
    // Bounded background work; never enqueue hundreds of requests ahead of interactive quotes.
    // The next run resumes uncached symbols. Baselines share one KV write, not one per company.
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(historyBudgetMs)]);
    let next = 0;
    let reportedFailure = false;
    await Promise.all(Array.from({ length: 2 }, async () => {
      while (!deadline.aborted && next < pending.length) {
        const quote = pending[next++];
        try {
          const points = await fetchHistory(quote, AbortSignal.any([deadline, AbortSignal.timeout(5_000)]));
          rows.set(quote.symbol, { item: describeMarketChange(quote, points), failed: false, previousSessionDate: points.at(-1)?.date ?? null });
          histories.set(quote.symbol, { sessionDate: marketSessionDate(quote.quotedAt)!, fetchedAt: Date.now(), points: points.slice(-21) });
        } catch (error) {
          if (!reportedFailure && !deadline.aborted) {
            reportedFailure = true;
            console.warn("movement_history_failed", JSON.stringify({ symbol: quote.symbol, kind: error instanceof Error ? error.name : "unknown" }));
          }
          // Numerical volume evidence remains valid when history is unavailable.
        }
      }
    }));
    signal.throwIfAborted();
    console.info("movement_scan_finished", JSON.stringify({ examined: quotes.length, attempted: next, checked: rows.size, historyBudgetMs, timedOut: deadline.aborted }));
    if (storage && histories.size) await storage.put(HISTORY_KEY, JSON.stringify(Object.fromEntries(
      quotes.flatMap(quote => { const row = histories.get(quote.symbol); return row ? [[quote.symbol, row]] : []; }),
    )), { expirationTtl: 7200 });
    const unavailable = quotes.length - rows.size;
    return {
      items: quotes.flatMap(quote => { const item = rows.has(quote.symbol) ? rows.get(quote.symbol)!.item : describeMarketChange(quote, []); return item ? [item] : []; }),
      examined: quotes.length, historyUnavailable: unavailable,
      partial: lists.some(result => result.status === "rejected") || unavailable > 0,
      coverage: { perRankingLimit: CHANGE_RANKING_LIMIT, rankingsReceived: successful.length,
        truncatedRankings: successful.filter(list => list.total > CHANGE_RANKING_LIMIT).length, historyChecked: rows.size },
    };
  }, { signal, ttlMs: 30_000, timeoutMs: historyBudgetMs + 25_000 });
}

async function fetchHistory(quote: MoverQuote, signal?: AbortSignal) {
  const date = marketSessionDate(quote.quotedAt)!;
  const start = new Date(Date.parse(date) - 60 * 86400_000).toISOString().slice(0, 10);
  const end = new Date(Date.parse(date) - 86400_000).toISOString().slice(0, 10);
  const history = await fetchChart(quote.symbol, "1mo", start, end, signal);
  const points = history.points.filter(point => /^\d{4}-\d{2}-\d{2}$/.test(point.date)
    && point.date < date && Number.isFinite(point.close) && point.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!points.length) throw new MarketError("비교할 종가가 없습니다.");
  return points;
}

/** Shared per-stock comparison; orchestration never occupies the provider queue. */
export async function fetchQuoteChange(quote: MoverQuote, signal?: AbortSignal) {
  const date = marketSessionDate(quote.quotedAt);
  if (!date) return { item: null, failed: true, previousSessionDate: null };
  try {
    const points = await fetchHistory(quote, signal);
    const previous = points.at(-1);
    const previousClose = quote.price - quote.change;
    const compatible = previous && previousClose > 0 && Math.abs(previous.close / previousClose - 1) < 0.01
      && consecutiveMarketSessions(previous.date, date);
    return { item: describeMarketChange(quote, points), failed: false,
      previousSessionDate: compatible ? previous.date : null };
  } catch {
    signal?.throwIfAborted();
    return { item: describeMarketChange(quote, []), failed: true, previousSessionDate: null };
  }
}
