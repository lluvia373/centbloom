import test from "node:test";
import assert from "node:assert/strict";
import { loadTypescript } from "./load-typescript.mjs";

const {
  WATCHED_MAX_AGE_MS, WATCHED_DEMAND_PREFIX, watchedReportKey, watchedFailureKey, watchedHistoryKey,
  usableWatchedReport, priorWatchedSession,
} = loadTypescript("src/features/market/server/watched-report-store.ts");
const { marketSessionDate } = loadTypescript("src/features/market/market-changes.ts");
const { normalizeWatchedQuote } = loadTypescript("src/features/market/server/watched-report-quote.ts");
const date = "2026-09-11T20:00:00Z", now = Date.parse("2026-09-12T10:00:00Z");
const quote = (quotedAt = date) => ({ symbol: "AAPL", name: "Apple Inc.", price: 100, change: 0.2,
  changePercent: 0.2, currency: "USD", quotedAt });
const story = (publishedAt = "2026-09-11T18:00:00Z") => ({ id: "story", title: "Apple announces new product launch",
  url: "https://example.com/apple-launch", publisher: "Source", publishedAt, symbols: ["AAPL"] });
const snapshot = (preparedAt = now, q = quote(), article = story()) => ({ version: 1, preparedAt,
  report: { quote: q, change: null, story: article, previous: null, expiresAt: preparedAt + WATCHED_MAX_AGE_MS } });
function memoryKV(initial = []) {
  const values = new Map(initial), writes = [];
  return { values, writes, get: async (key, type) => {
    const value = values.get(key) ?? null;
    return value && type === "json" ? JSON.parse(value) : value;
  }, put: async (key, value, options) => { values.set(key, value); writes.push({ key, value, options }); },
  delete: async key => values.delete(key), list: async () => ({ keys: [], list_complete: true }) };
}
const fresh = () => {
  const quotedAt = new Date(Date.now() - 1000).toISOString();
  return snapshot(Date.now() - 6 * 60_000, quote(quotedAt), story(quotedAt));
};
const translation = { createNewsTitleTranslator: () => async stories => stories };

test("quiet stocks retain a useful quote and direct article without an invented abnormal signal", () => {
  const ready = usableWatchedReport(snapshot(), "AAPL", now);
  assert.equal(ready.report.change, null);
  assert.equal(ready.report.story.title, story().title);
  assert.equal(usableWatchedReport(snapshot(now, quote(), null), "AAPL", now).report.story, null);
  assert.equal(usableWatchedReport(snapshot(), "MSFT", now), null);
  assert.equal(usableWatchedReport(snapshot(), "AAPL", now + WATCHED_MAX_AGE_MS), null);
  const mixed = snapshot(); mixed.report.change = { quote: { ...quote(), price: 99 },
    sessionDate: "2026-09-11", signals: [{ kind: "volume", value: 200, baseline: 100, ratio: 2 }] };
  assert.equal(usableWatchedReport(mixed, "AAPL", now), null);
});

test("missing numbers and unsupported assets cannot masquerade as US stock comparisons", () => {
  const raw = { symbol: "AAPL", shortName: "Apple", quoteType: "EQUITY", region: "US", currency: "USD",
    regularMarketPrice: 100, regularMarketChange: 0, regularMarketChangePercent: 0,
    regularMarketTime: new Date(), averageDailyVolume3Month: 200, regularMarketVolume: 50 };
  assert.equal(normalizeWatchedQuote(raw, "AAPL").averageDailyVolume3Month, 200);
  assert.equal(normalizeWatchedQuote(raw, "AAPL").changePercent, 0);
  for (const field of ["regularMarketPrice", "regularMarketChange", "regularMarketChangePercent", "regularMarketTime"]) {
    assert.throws(() => normalizeWatchedQuote({ ...raw, [field]: undefined }, "AAPL"), error => error.status === 502);
  }
  for (const invalid of [{ quoteType: "ETF" }, { region: "KR" }, { currency: "KRW" }])
    assert.throws(() => normalizeWatchedQuote({ ...raw, ...invalid }, "AAPL"), error => error.status === 422);
  const missingAverage = normalizeWatchedQuote({ ...raw, averageDailyVolume3Month: undefined }, "AAPL");
  assert.equal(missingAverage.averageDailyVolume3Month, undefined);
});

test("follow-up uses only a saved exact previous session, never a same-day or skipped-day refresh", () => {
  const prior = { version: 1, sessionDate: "2026-09-10", quotedAt: "2026-09-10T19:30:00Z", price: 99, changePercent: -1 };
  assert.equal(priorWatchedSession(prior, "2026-09-10", "2026-09-11", now).price, 99);
  assert.equal(priorWatchedSession(prior, "2026-09-11", "2026-09-11", now), null);
  assert.equal(priorWatchedSession(prior, "2026-09-09", "2026-09-11", now), null);
  assert.equal(priorWatchedSession(prior, null, "2026-09-11", now), null);
  assert.equal(priorWatchedSession(null, "2026-09-10", "2026-09-11", now), null);
  assert.equal(priorWatchedSession(prior, "2026-09-10", "2026-09-11", now + 8 * 86400_000), null);
  const friday = { ...prior, sessionDate: "2026-09-11", quotedAt: date };
  assert.equal(priorWatchedSession(friday, "2026-09-11", "2026-09-14", Date.parse("2026-09-14T20:00:00Z")).sessionDate, "2026-09-11");
});

test("a cold read schedules work after the response and does not call the stock provider inline", async () => {
  const callbacks = []; let started = false;
  const { readWatchedReport } = loadTypescript("src/features/market/server/watched-report-response.ts", {
    react: { cache: fn => fn }, "next/server": { connection: async () => {}, after: fn => callbacks.push(fn) },
    "@opennextjs/cloudflare": { getCloudflareContext: async () => ({ env: { NEWS_CACHE: memoryKV() } }) },
    "./watched-report-refresh": { refreshWatchedReport: () => { started = true; return new Promise(() => {}); } },
  });
  assert.equal(await readWatchedReport(" aapl "), null);
  assert.equal(started, false);
  assert.equal(callbacks.length, 1);
});

test("normal stored results remain readable after the latest background provider failure", async () => {
  const ready = fresh(), kv = memoryKV([[watchedReportKey("AAPL"), JSON.stringify(ready)],
    [watchedFailureKey("AAPL"), JSON.stringify({ status: 502 })]]);
  const { readWatchedReport } = loadTypescript("src/features/market/server/watched-report-response.ts", {
    react: { cache: fn => fn }, "next/server": { connection: async () => {}, after: () => {} },
    "@opennextjs/cloudflare": { getCloudflareContext: async () => ({ env: { NEWS_CACHE: kv } }) },
    "./watched-report-refresh": { refreshWatchedReport: async () => {} },
  });
  assert.equal((await readWatchedReport("AAPL")).quote.price, ready.report.quote.price);
  kv.values.delete(watchedReportKey("AAPL"));
  await assert.rejects(readWatchedReport("AAPL"), error => error.status === 502);
  kv.values.set(watchedFailureKey("AAPL"), JSON.stringify({ status: 422 }));
  await assert.rejects(readWatchedReport("AAPL"), error => error.status === 422);
});

test("a successful quiet refresh removes obsolete signals but retains the stock and article", async () => {
  const ready = fresh();
  ready.report.change = { quote: ready.report.quote, sessionDate: marketSessionDate(ready.report.quote.quotedAt),
    signals: [{ kind: "volume", value: 200, baseline: 100, ratio: 2 }] };
  const prior = JSON.stringify(ready), kv = memoryKV([[watchedReportKey("AAPL"), prior]]);
  const q = { ...ready.report.quote, price: 101 };
  const { refreshWatchedReport } = loadTypescript("src/features/market/server/watched-report-refresh.ts", {
    "./watched-report-quote": { watchedSymbol: value => value, fetchWatchedQuote: async () => q },
    "./market-changes": { fetchQuoteChange: async () => ({ item: null, failed: false, previousSessionDate: null }) },
    "./news": { fetchCompanyNews: async () => ({ stories: [ready.report.story], partial: false }) },
    "./translation-provider": translation,
  });
  await refreshWatchedReport({ NEWS_CACHE: kv }, "AAPL", { recordDemand: true });
  const stored = JSON.parse(kv.values.get(watchedReportKey("AAPL")));
  assert.equal(stored.report.change, null);
  assert.equal(stored.report.story.title, story().title);
  assert.equal(stored.report.quote.price, 101);
  assert.equal(stored.report.previous, null);
  assert.ok(kv.values.has(watchedHistoryKey("AAPL", marketSessionDate(q.quotedAt))));
  const demand = kv.writes.find(row => row.key === WATCHED_DEMAND_PREFIX + "AAPL");
  assert.equal(demand.options.expirationTtl, 86400);
  assert.deepEqual(Object.keys(demand.options.metadata), ["requestedAt"]);
  assert.equal(kv.writes.find(row => row.key === watchedReportKey("AAPL")).options.expirationTtl, 1800);
});

test("failed comparison or news collection never overwrites the last complete stock report", async () => {
  for (const failedPart of ["history", "news"]) {
    const ready = fresh(), prior = JSON.stringify(ready), kv = memoryKV([[watchedReportKey("AAPL"), prior]]);
    const { refreshWatchedReport } = loadTypescript("src/features/market/server/watched-report-refresh.ts", {
      "./watched-report-quote": { watchedSymbol: value => value, fetchWatchedQuote: async () => ready.report.quote },
      "./market-changes": { fetchQuoteChange: async () => ({ item: null, failed: failedPart === "history", previousSessionDate: null }) },
      "./news": { fetchCompanyNews: async () => { if (failedPart === "news") throw Error("offline");
        return { stories: [ready.report.story], partial: false }; } },
      "./translation-provider": translation,
    });
    await assert.rejects(refreshWatchedReport({ NEWS_CACHE: kv }, "AAPL"));
    assert.equal(kv.values.get(watchedReportKey("AAPL")), prior);
    assert.equal(kv.writes.find(row => row.key === watchedFailureKey("AAPL")).options.expirationTtl, 60);
  }
});

test("scheduled work is bounded to 50 recently demanded public symbols, in pairs", async () => {
  const kv = memoryKV(); let listOptions; let active = 0, maximum = 0;
  const calls = [];
  kv.list = async options => {
    listOptions = options;
    return { keys: Array.from({ length: 61 }, (_, i) => ({ name: WATCHED_DEMAND_PREFIX + "S" + i,
      metadata: { requestedAt: Date.now() - (i === 0 ? 2 * 86400_000 : i * 1000) } })), list_complete: true };
  };
  const { refreshScheduledWatchedReports } = loadTypescript("src/features/market/server/watched-report-refresh.ts", {
    "./watched-report-quote": { watchedSymbol: value => value, fetchWatchedQuote: async symbol => {
      calls.push(symbol); active++; maximum = Math.max(maximum, active);
      await Promise.resolve(); active--;
      return { ...fresh().report.quote, symbol };
    } },
    "./market-changes": { fetchQuoteChange: async () => ({ item: null, failed: false, previousSessionDate: null }) },
    "./news": { fetchCompanyNews: async () => ({ stories: [], partial: false }) },
    "./translation-provider": translation,
  });
  await refreshScheduledWatchedReports({ NEWS_CACHE: kv });
  assert.equal(calls.length, 50);
  assert.equal(calls.includes("S0"), false);
  assert.ok(maximum <= 2);
  assert.equal(listOptions.prefix, WATCHED_DEMAND_PREFIX);
  assert.equal(listOptions.limit, 1000);
  assert.equal(kv.writes.some(row => row.key.startsWith(WATCHED_DEMAND_PREFIX)), false);
});

test("a new report links the recorded prior trading day and keeps its separate seven-day storage", async () => {
  const ready = fresh(), q = ready.report.quote;
  const priorAt = new Date(Date.parse(q.quotedAt) - 86400_000).toISOString();
  const previousSessionDate = marketSessionDate(priorAt);
  const previous = { version: 1, sessionDate: previousSessionDate, quotedAt: priorAt, price: 95, changePercent: -2 };
  const key = watchedHistoryKey("AAPL", previousSessionDate);
  const kv = memoryKV([[key, JSON.stringify(previous)]]);
  const { refreshWatchedReport } = loadTypescript("src/features/market/server/watched-report-refresh.ts", {
    "./watched-report-quote": { watchedSymbol: value => value, fetchWatchedQuote: async () => q },
    "./market-changes": { fetchQuoteChange: async () => ({ item: null, failed: false, previousSessionDate }) },
    "./news": { fetchCompanyNews: async () => ({ stories: [], partial: false }) },
    "./translation-provider": translation,
  });
  await refreshWatchedReport({ NEWS_CACHE: kv }, "AAPL");
  const stored = JSON.parse(kv.values.get(watchedReportKey("AAPL")));
  assert.equal(stored.report.previous.sessionDate, previousSessionDate);
  assert.equal(stored.report.previous.price, 95);
  assert.equal(kv.values.get(key), JSON.stringify(previous));
  const currentHistory = kv.writes.find(row => row.key === watchedHistoryKey("AAPL", marketSessionDate(q.quotedAt)));
  assert.equal(currentHistory.options.expirationTtl, 7 * 86400);
});

test("the public API exposes pending state and rejects personal or multi-symbol query payloads", async () => {
  let calls = 0;
  const { GET } = loadTypescript("src/app/api/stock-report/route.ts", {
    "next/server": { NextResponse: { json: (body, init) => ({ body, ...init }) } },
    "@/features/market/server/watched-report-response": { readWatchedReport: async () => { calls++; return null; } },
  });
  const pending = await GET({ url: "https://example.com/api/stock-report?symbol=AAPL" });
  assert.equal(pending.status, 202);
  assert.equal(pending.headers["Retry-After"], "2");
  assert.equal(pending.headers["Cache-Control"], "no-store");
  for (const query of ["", "symbol=AAPL&symbol=MSFT", "symbol=AAPL&userId=private", "symbols=AAPL,MSFT"])
    assert.equal((await GET({ url: "https://example.com/api/stock-report?" + query })).status, 400);
  assert.equal(calls, 1);
});

test("research queue saturation does not prevent later symbols from recording public demand", async () => {
  const kv = memoryKV();
  const { refreshWatchedReport } = loadTypescript("src/features/market/server/watched-report-refresh.ts", {
    "./watched-report-quote": { watchedSymbol: value => value, fetchWatchedQuote: async () => new Promise(() => {}) },
    "./market-changes": { fetchQuoteChange: async () => ({ item: null, failed: false, previousSessionDate: null }) },
    "./news": { fetchCompanyNews: async () => ({ stories: [], partial: false }) },
    "./translation-provider": translation,
  });
  const running = Promise.allSettled(["AAPL", "MSFT", "NVDA"].map(symbol =>
    refreshWatchedReport({ NEWS_CACHE: kv }, symbol, { recordDemand: true, timeoutMs: 100 })));
  await new Promise(resolve => setTimeout(resolve, 0));
  for (const symbol of ["AAPL", "MSFT", "NVDA"])
    assert.ok(kv.values.has(WATCHED_DEMAND_PREFIX + symbol));
  assert.ok((await running).every(result => result.status === "rejected"));
});

test("a short request joining a longer scheduled job retains its own time limit", async () => {
  const kv = memoryKV(); let scheduledSettled = false;
  const { refreshWatchedReport } = loadTypescript("src/features/market/server/watched-report-refresh.ts", {
    "./watched-report-quote": { watchedSymbol: value => value, fetchWatchedQuote: async () => new Promise(() => {}) },
    "./market-changes": { fetchQuoteChange: async () => ({ item: null, failed: false, previousSessionDate: null }) },
    "./news": { fetchCompanyNews: async () => ({ stories: [], partial: false }) },
    "./translation-provider": translation,
  });
  const scheduled = refreshWatchedReport({ NEWS_CACHE: kv }, "AAPL", { timeoutMs: 200 }).then(
    () => { scheduledSettled = true; }, () => { scheduledSettled = true; },
  );
  await new Promise(resolve => setTimeout(resolve, 0));
  await assert.rejects(refreshWatchedReport({ NEWS_CACHE: kv }, "AAPL", { recordDemand: true, timeoutMs: 20 }));
  assert.equal(scheduledSettled, false);
  await scheduled;
});
