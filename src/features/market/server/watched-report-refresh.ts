import { createRequestCache } from "@/shared/async/request-cache";
import { selectChangeStory } from "../change-research";
import { marketSessionDate } from "../market-changes";
import { fetchQuoteChange } from "./market-changes";
import { fetchCompanyNews } from "./news";
import { MarketError } from "./provider";
import { createNewsTitleTranslator } from "./translation-provider";
import { fetchWatchedQuote, watchedSymbol } from "./watched-report-quote";
import {
  WATCHED_DEMAND_PREFIX, WATCHED_HISTORY_MS, WATCHED_MAX_AGE_MS, WATCHED_REFRESH_MS,
  priorWatchedSession, readPreparedWatchedReport, watchedFailureKey, watchedHistoryKey, watchedReportKey,
  type PreparedWatchedReport, type StoredWatchedSession,
} from "./watched-report-store";

type Bindings = Pick<WorkerBindings, "NEWS_CACHE" | "NEWS_AI">;
type Options = { force?: boolean; timeoutMs?: number; recordDemand?: boolean };
const jobs = createRequestCache({ concurrency: 2, maxEntries: 128 });
const demandJobs = createRequestCache({ concurrency: 16, maxEntries: 128 });

function recordWatchedDemand(storage: Bindings["NEWS_CACHE"], symbol: string, timeoutMs: number) {
  const key = WATCHED_DEMAND_PREFIX + symbol;
  return demandJobs.request(key, async signal => {
    const lastVisit = Number(await storage.get(key));
    if (!lastVisit || Date.now() - lastVisit >= WATCHED_REFRESH_MS) {
      signal.throwIfAborted();
      const requestedAt = Date.now();
      await storage.put(key, String(requestedAt), { expirationTtl: 86400, metadata: { requestedAt } });
    }
  }, { signal: AbortSignal.timeout(timeoutMs), ttlMs: 30_000, timeoutMs });
}

export async function refreshWatchedReport(env: Bindings, value: string,
  { force = false, timeoutMs = 25_000, recordDemand = false }: Options = {}) {
  const symbol = watchedSymbol(value);
  const key = watchedReportKey(symbol);
  const deadline = Date.now() + timeoutMs;
  const [prepared, failed] = await Promise.all([
    readPreparedWatchedReport(env.NEWS_CACHE, symbol),
    env.NEWS_CACHE.get<{ status?: number }>(watchedFailureKey(symbol), "json"),
  ]);
  // Registration is independent of slow research: even queued stocks reach the next Cron.
  // Only public ticker/time demand is retained. No account identifiers, lists or cookies.
  if (recordDemand && failed?.status !== 422 && failed?.status !== 404) {
    await recordWatchedDemand(env.NEWS_CACHE, symbol, Math.max(1, Math.min(5_000, deadline - Date.now())));
  }
  // Fresh reports and cooldowns never occupy the research queue.
  if (!force && (prepared && Date.now() - prepared.preparedAt < WATCHED_REFRESH_MS || failed)) return;
  if (Date.now() >= deadline) throw new DOMException("종목 자료 준비 시간이 초과되었습니다.", "TimeoutError");
  if (force) jobs.invalidate(key);
  return jobs.request(key, async signal => {
    // Another location/job may have finished while this request was waiting.
    const existing = await readPreparedWatchedReport(env.NEWS_CACHE, symbol);
    const failure = await env.NEWS_CACHE.get<{ status?: number }>(watchedFailureKey(symbol), "json");
    if (!force && (existing && Date.now() - existing.preparedAt < WATCHED_REFRESH_MS || failure)) return;
    try {
      signal.throwIfAborted();
      const quote = await fetchWatchedQuote(symbol, signal);
      const sessionDate = marketSessionDate(quote.quotedAt)!;
      const [analysis, news] = await Promise.all([fetchQuoteChange(quote, signal), fetchCompanyNews(symbol, quote.name, signal)]);
      signal.throwIfAborted();
      // Failed research cannot silently turn an abnormal stock into a quiet one.
      if (analysis.failed) throw new MarketError("종목의 비교 자료를 확인할 수 없습니다.");
      const story = selectChangeStory({ quote, sessionDate, signals: [] }, news.stories);
      if (news.partial && !story) throw new MarketError("종목의 기사를 확인할 수 없습니다.");
      const translate = createNewsTitleTranslator(env.NEWS_AI, env.NEWS_CACHE);
      const translated = story ? (await translate([story], signal, Math.max(1, Math.min(80_000, timeoutMs - 5_000))))[0] : null;
      const previousValue = analysis.previousSessionDate
        ? await env.NEWS_CACHE.get(watchedHistoryKey(symbol, analysis.previousSessionDate), "json") : null;
      signal.throwIfAborted();
      const preparedAt = Date.now();
      const snapshot: PreparedWatchedReport = { version: 1, preparedAt, report: {
        quote, change: analysis.item, story: translated,
        previous: priorWatchedSession(previousValue, analysis.previousSessionDate, sessionDate, preparedAt),
        expiresAt: preparedAt + WATCHED_MAX_AGE_MS,
      } };
      const recorded: StoredWatchedSession = { version: 1, sessionDate, quotedAt: quote.quotedAt!,
        price: quote.price, changePercent: quote.changePercent };
      const historyKey = watchedHistoryKey(symbol, sessionDate);
      const prior = await env.NEWS_CACHE.get<StoredWatchedSession>(historyKey, "json");
      signal.throwIfAborted();
      // Daily keys prevent this session from replacing another day's record.
      if (!prior || !Number.isFinite(Date.parse(prior.quotedAt)) || Date.parse(prior.quotedAt) <= Date.parse(recorded.quotedAt)) {
        await env.NEWS_CACHE.put(historyKey, JSON.stringify(recorded), { expirationTtl: WATCHED_HISTORY_MS / 1000 });
      }
      signal.throwIfAborted();
      // Quotes and articles are replaced together, only after all research succeeds.
      await env.NEWS_CACHE.put(key, JSON.stringify(snapshot), { expirationTtl: WATCHED_MAX_AGE_MS / 1000 });
      if (failure) await env.NEWS_CACHE.delete(watchedFailureKey(symbol));
    } catch (error) {
      const status = error instanceof MarketError && (error.status === 404 || error.status === 422) ? error.status : 502;
      await env.NEWS_CACHE.put(watchedFailureKey(symbol), JSON.stringify({ status }), {
        expirationTtl: status === 502 ? 60 : 86400,
      });
      throw error;
    }
  }, { signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())), ttlMs: 30_000,
    timeoutMs: Math.max(1, deadline - Date.now()) });
}

export async function refreshScheduledWatchedReports(env: Bindings) {
  const startedAt = Date.now();
  const demand = await env.NEWS_CACHE.list<{ requestedAt: number }>({ prefix: WATCHED_DEMAND_PREFIX, limit: 1000 });
  const symbols = demand.keys.filter(key => typeof key.metadata?.requestedAt === "number"
    && Number.isFinite(key.metadata.requestedAt) && key.metadata.requestedAt <= startedAt + 300_000
    && startedAt - key.metadata.requestedAt < 86400_000)
    .sort((a, b) => (b.metadata?.requestedAt ?? 0) - (a.metadata?.requestedAt ?? 0))
    .flatMap(key => {
      try { return [watchedSymbol(key.name.slice(WATCHED_DEMAND_PREFIX.length))]; } catch { return []; }
    }).slice(0, 50);
  let failed = 0;
  // Pair timeouts start when work starts. Leave room inside the Cron's overall lifetime.
  for (let index = 0; index < symbols.length; index += 2) {
    const remaining = 10 * 60_000 - (Date.now() - startedAt);
    if (remaining < 1000) break;
    const results = await Promise.allSettled(symbols.slice(index, index + 2)
      .map(symbol => refreshWatchedReport(env, symbol, { timeoutMs: Math.min(70_000, remaining) })));
    failed += results.filter(result => result.status === "rejected").length;
  }
  if (failed) console.warn("watched_report_refresh_partial", { failed });
}


