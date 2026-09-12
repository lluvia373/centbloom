import test from "node:test";
import { createRequire } from "node:module";
const requireForRender = createRequire(import.meta.url);
import assert from "node:assert/strict";
import { loadTypescript } from "./load-typescript.mjs";

const { selectChangeStory, companySearchName } = loadTypescript("src/features/market/change-research.ts");
const { CHANGES_KEY, CHANGES_MAX_AGE_MS, usableChanges } = loadTypescript("src/features/market/server/prepared-changes.ts");
const now = Date.parse("2026-09-12T10:00:00Z");
const item = {
  quote: { symbol: "SLS", name: "SELLAS Life Sciences Group, Inc", price: 11.55, change: -1.94,
    changePercent: -14.42, currency: "USD", quotedAt: "2026-09-11T20:00:00Z" },
  sessionDate: "2026-09-11", signals: [{ kind: "price", value: -14.42, baseline: 4.41, ratio: 3.27 }],
};
const story = (overrides = {}) => ({ id: "article", title: "SELLAS announces clinical trial results",
  publisher: "Source", url: "https://example.com/sellas", publishedAt: "2026-09-11T17:00:00Z",
  symbols: ["SLS"], ...overrides });
const feed = (items = [{ ...item, story: story() }]) => ({
  items, examined: 8, historyUnavailable: 0, partial: false, expiresAt: now + CHANGES_MAX_AGE_MS,
});
const snapshot = (value = feed(), preparedAt = now) => ({ version: 1, preparedAt, feed: value });
function memoryKV(initial = []) {
  const values = new Map(initial);
  return { values, get: async (key, type) => {
    const value = values.get(key) ?? null; return value && type === "json" ? JSON.parse(value) : value;
  }, put: async (key, value) => { values.set(key, value); } };
}
const freshItem = () => ({ ...item, quote: { ...item.quote, quotedAt: new Date().toISOString() },
  sessionDate: new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()) });
const freshStory = () => story({ publishedAt: new Date(Date.now() - 1000).toISOString() });
const priorSnapshot = () => JSON.stringify(snapshot({ ...feed([{ ...freshItem(), story: freshStory() }]) }, Date.now() - 6 * 60_000));

test("ticker-only namesakes and secondary mentions never become the company's evidence", () => {
  assert.equal(selectChangeStory(item, [story({ title: "NASA SLS launches rocket", symbols: ["BA"] })], now), null);
  assert.equal(selectChangeStory(item, [story({ title: "Dell announces earnings", symbols: ["SLS", "DELL"] })], now), null);
  assert.equal(selectChangeStory(item, [], now), null);
});
test("recent direct company events qualify; original source and optional translation are preserved", () => {
  const selected = selectChangeStory(item, [story({ titleKo: "SELLAS 임상시험 결과 발표" })], now);
  assert.equal(selected.titleKo, "SELLAS 임상시험 결과 발표");
  assert.equal(selected.url, "https://example.com/sellas");
  assert.equal(selected.publisher, "Source");
  assert.equal(companySearchName(item.quote.name), "SELLAS Life Sciences Group");
});
test("opinion, futures roundups, unsafe links and blank titles cannot fill a card", () => {
  for (const title of ["Should You Buy SLS Stock After Its Drop?", "SLS: Best Stocks to Buy After Earnings",
    "SLS Stock Futures Rise After Earnings", "", "SLS company profile"]) {
    assert.equal(selectChangeStory(item, [story({ title })], now), null, title);
  }
  assert.equal(selectChangeStory(item, [story({ url: "javascript:alert(1)" })], now), null);
});
test("article window follows the actual quote session, not just the day the user visits", () => {
  for (const publishedAt of ["2026-09-08T19:59:59Z", "2026-09-12T10:00:01Z", "2026-09-13T00:00:00Z"]) {
    assert.equal(selectChangeStory(item, [story({ publishedAt })], now), null);
  }
  assert.ok(selectChangeStory(item, [story({ publishedAt: "2026-09-12T03:00:00Z" })], now));
  assert.equal(selectChangeStory(item, [story({ publishedAt: "2026-09-12T21:00:00Z" })], now + 2 * 86400_000), null);
});
test("a specific stock report qualifies despite its Stock Market Today prefix", () => {
  const hpe = { ...item, quote: { ...item.quote, symbol: "HPE", name: "Hewlett Packard Enterprise Comp" } };
  assert.ok(selectChangeStory(hpe, [story({ symbols: ["HPE"],
    title: "Stock Market Today, Sept. 11: HPE Surges on AI Infrastructure Demand and Recently Raised Guidance" })], now));
});
test("common English tickers need an explicit company name or ticker notation", () => {
  const ai = { ...item, quote: { ...item.quote, symbol: "AI", name: "C3.ai, Inc." } };
  assert.equal(selectChangeStory(ai, [story({ symbols: ["AI"], title: "AI revenue surges across technology companies" })], now), null);
  assert.ok(selectChangeStory(ai, [story({ symbols: ["AI"], title: "C3.ai (AI) reports earnings" })], now));
});
test("the closest relevant article wins, not a newer unrelated item", () => {
  const selected = selectChangeStory(item, [
    story({ title: "Other company announces results", publishedAt: "2026-09-11T20:00:00Z" }),
    story({ title: "SELLAS raises capital", url: "https://example.com/close", publishedAt: "2026-09-11T19:00:00Z" }),
    story({ title: "SELLAS announces clinical results", url: "https://example.com/old", publishedAt: "2026-09-10T10:00:00Z" }),
  ], now);
  assert.equal(selected.url, "https://example.com/close");
});
test("company-name search supplements the ticker query and preserves association beyond ticker position three", async () => {
  const queries = [];
  const { fetchCompanyNews } = loadTypescript("src/features/market/server/news.ts", {
    "./provider": { providerRequests: { request: (_key, load) => load(new AbortController().signal) }, yahoo: {
      search: async query => { queries.push(query); return { news: query === "SLS" ? [] : [{
        title: "SELLAS announces trial results", publisher: "Source", link: story().url,
        providerPublishTime: new Date(), relatedTickers: ["A", "B", "C", "SLS"],
      }] }; },
    } },
  });
  const result = await fetchCompanyNews("SLS", item.quote.name);
  assert.deepEqual(queries, ["SLS", "SELLAS Life Sciences Group"]);
  assert.equal(result.partial, false);
  assert.ok(result.stories[0].symbols.includes("SLS"));
});
test("one failed search is partial; both failed searches are not treated as no articles", async () => {
  let allFail = false;
  const { fetchCompanyNews } = loadTypescript("src/features/market/server/news.ts", {
    "./provider": { providerRequests: { request: (_key, load) => load(new AbortController().signal) },
      yahoo: { search: async query => { if (allFail || query === "SLS") throw Error("offline"); return { news: [] }; } } },
  });
  assert.equal((await fetchCompanyNews("SLS", item.quote.name)).partial, true);
  allFail = true;
  await assert.rejects(fetchCompanyNews("SLS", item.quote.name));
});
test("snapshots reject stale data and malformed/irrelevant cards; a successful empty collection stays empty", () => {
  assert.equal(usableChanges(snapshot(), now + CHANGES_MAX_AGE_MS + 1), null);
  assert.equal(usableChanges(snapshot(feed([{ ...item, story: story({ symbols: ["BA"] }) }])), now), null);
  assert.equal(usableChanges(snapshot(feed([{ ...item, signals: [] }])), now), null);
  assert.equal(usableChanges(snapshot(feed([{ ...item, quote: { ...item.quote, price: NaN } }])), now), null);
  assert.equal(usableChanges(snapshot(feed([])), now).feed.items.length, 0);
  assert.equal(usableChanges(snapshot(), now).feed.expiresAt, now + CHANGES_MAX_AGE_MS);
});
test("cache miss schedules research after the response and never waits for provider work", async () => {
  const callbacks = []; let started = false;
  const { readPreparedChanges } = loadTypescript("src/features/market/server/changes-response.ts", {
    "react": { cache: fn => fn }, "next/server": { connection: async () => {}, after: fn => callbacks.push(fn) },
    "@opennextjs/cloudflare": { getCloudflareContext: async () => ({ env: { NEWS_CACHE: memoryKV() } }) },
    "./changes-refresh": { refreshPreparedChanges: () => { started = true; return new Promise(() => {}); } },
  });
  assert.equal(await readPreparedChanges(), null); assert.equal(started, false); assert.equal(callbacks.length, 1);
});
test("healthy prepared data returns even when the latest refresh failed", async () => {
  const prior = priorSnapshot();
  const kv = memoryKV([[CHANGES_KEY, prior], ["changes-failure:" + CHANGES_KEY, "1"]]);
  const { readPreparedChanges } = loadTypescript("src/features/market/server/changes-response.ts", {
    "react": { cache: fn => fn }, "next/server": { connection: async () => {}, after: () => {} },
    "@opennextjs/cloudflare": { getCloudflareContext: async () => ({ env: { NEWS_CACHE: kv } }) },
    "./changes-refresh": { refreshPreparedChanges: async () => {} },
  });
  assert.equal((await readPreparedChanges()).items[0].story.title, story().title);
});
test("background research drops unsubstantiated candidates and stores quote/article pairs together", async () => {
  const kv = memoryKV();
  const first = freshItem(), second = { ...freshItem(), quote: { ...freshItem().quote, symbol: "NONE" } };
  const { refreshPreparedChanges } = loadTypescript("src/features/market/server/changes-refresh.ts", {
    "./market-changes": { fetchMarketChanges: async () => feed([first, second]) },
    "./news": { fetchCompanyNews: async symbol => ({ stories: symbol === "SLS" ? [freshStory()] : [], partial: false }) },
    "./translation-provider": { createNewsTitleTranslator: () => async stories => stories },
  });
  await refreshPreparedChanges({ NEWS_CACHE: kv });
  const stored = JSON.parse(kv.values.get(CHANGES_KEY));
  assert.equal(stored.feed.items.length, 1);
  assert.equal(stored.feed.items[0].quote.quotedAt, first.quote.quotedAt);
  assert.equal(stored.feed.items[0].story.title, story().title);
});
test("failed research preserves the previous complete snapshot and backs off", async () => {
  const prior = priorSnapshot(), kv = memoryKV([[CHANGES_KEY, prior]]);
  const { refreshPreparedChanges } = loadTypescript("src/features/market/server/changes-refresh.ts", {
    "./market-changes": { fetchMarketChanges: async () => feed([freshItem()]) },
    "./news": { fetchCompanyNews: async () => { throw Error("offline"); } },
    "./translation-provider": { createNewsTitleTranslator: () => async stories => stories },
  });
  await assert.rejects(refreshPreparedChanges({ NEWS_CACHE: kv }));
  assert.equal(kv.values.get(CHANGES_KEY), prior);
  assert.equal(kv.values.get("changes-failure:" + CHANGES_KEY), "1");
  await refreshPreparedChanges({ NEWS_CACHE: kv }); // cooldown returns without changing the snapshot
  assert.equal(kv.values.get(CHANGES_KEY), prior);
});
test("a successful collection without relevant stories removes obsolete cards", async () => {
  const kv = memoryKV([[CHANGES_KEY, priorSnapshot()]]);
  const { refreshPreparedChanges } = loadTypescript("src/features/market/server/changes-refresh.ts", {
    "./market-changes": { fetchMarketChanges: async () => feed([freshItem()]) },
    "./news": { fetchCompanyNews: async () => ({ stories: [], partial: false }) },
    "./translation-provider": { createNewsTitleTranslator: () => async stories => stories },
  });
  await refreshPreparedChanges({ NEWS_CACHE: kv });
  assert.equal(JSON.parse(kv.values.get(CHANGES_KEY)).feed.items.length, 0);
});
test("filtering and representative selection retain each stock's researched article", () => {
  const { selectMarketChanges } = loadTypescript("src/features/market/market-changes.ts");
  assert.equal(selectMarketChanges(feed().items, "price")[0].story.url, story().url);
});
test("cold-feed waiting can be cancelled and does not parse a pending response as data", async () => {
  const original = globalThis.fetch;
  const controller = new AbortController(); let calls = 0;
  globalThis.fetch = async () => { calls++; return { status: 202, ok: true, json: async () => { throw Error("pending body must not be parsed"); } }; };
  try {
    const { fetchPreparedFeed } = loadTypescript("src/shared/async/prepared-feed.ts");
    const pending = fetchPreparedFeed("/api/market-changes", controller.signal);
    await new Promise(resolve => setTimeout(resolve, 0));
    controller.abort(new Error("cancelled"));
    await assert.rejects(pending, /cancelled/);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test("representative cards show the article directly; a researched empty feed renders no placeholder section", () => {
  const React = requireForRender("react");
  const { renderToStaticMarkup } = requireForRender("react-dom/server");
  let data = feed();
  const { MarketChanges } = loadTypescript("src/features/home/MarketChanges.tsx", {
    "@/features/market/use-market-changes": { useMarketChanges: () => ({ data, failed: false, retry: () => {} }) },
    "@/features/watchlist/WatchStockButton": { WatchStockButton: () => null },
    "@/hooks/useWatchlist": { useWatchlist: () => ({ items: [] }) },
    "@/features/market/use-watched-reports": { useWatchedReports: () => ({}) },
    "@/components/AssetAvatar": { AssetAvatar: () => null },
    "./home.module.css": { default: new Proxy({}, { get: (_, key) => String(key) }) },
  });
  const html = renderToStaticMarkup(React.createElement(MarketChanges, { initialData: data }));
  assert.match(html, /SELLAS announces clinical trial results/);
  assert.match(html, /종목 뉴스/);
  assert.doesNotMatch(html, /흐름 전환|함께 확인할 소식|<details|<summary/);
  assert.match(html, /https:\/\/example.com\/sellas/);
  assert.doesNotMatch(html, /종목에서 뉴스 확인|확인된 기사가 없|일부 비교 자료/);
  data = feed([]);
  assert.equal(renderToStaticMarkup(React.createElement(MarketChanges, { initialData: data })), "");
});

test("history is visible without disclosure and longer card lists are paged three at a time", () => {
  const React = requireForRender("react");
  const { renderToStaticMarkup } = requireForRender("react-dom/server");
  const recentMoves = [-1.1, 1.3, -0.5, 0.8, 2.2].map((percent, index) => ({
    date: "2026-09-" + String(index + 4).padStart(2, "0"), percent,
  }));
  let data = feed(Array.from({ length: 4 }, (_, index) => ({
    ...item, quote: { ...item.quote, symbol: "STOCK" + index },
    story: story({ title: "Company event " + index }),
    context: { recentMoves },
  })));
  const { MarketChanges } = loadTypescript("src/features/home/MarketChanges.tsx", {
    "@/features/market/use-market-changes": { useMarketChanges: () => ({ data, failed: false, retry: () => {} }) },
    "@/features/watchlist/WatchStockButton": { WatchStockButton: () => null },
    "@/hooks/useWatchlist": { useWatchlist: () => ({ items: [] }) },
    "@/features/market/use-watched-reports": { useWatchedReports: () => ({}) },
    "@/components/AssetAvatar": { AssetAvatar: () => null },
    "./home.module.css": { default: new Proxy({}, { get: (_, key) => String(key) }) },
  });
  let html = renderToStaticMarkup(React.createElement(MarketChanges, { initialData: data }));
  assert.equal((html.match(/<article/g) ?? []).length, 3);
  assert.equal((html.match(/<time /g) ?? []).length, 18);
  assert.match(html, /직전 5거래일 \+ 이번 장/);
  assert.match(html, /주가 등락률/);
  assert.match(html, /이번 장/);
  assert.match(html, /다음 종목/);
  assert.doesNotMatch(html, /Company event 3|<details|<summary|aria-expanded|흐름 전환/);
  data = feed([{ ...data.items[0], context: undefined }]);
  html = renderToStaticMarkup(React.createElement(MarketChanges, { initialData: data }));
  assert.doesNotMatch(html, /직전 5거래일|다음 종목/);
});
