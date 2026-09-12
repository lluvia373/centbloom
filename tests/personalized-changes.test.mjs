import test from "node:test";
import { createRequire } from "node:module";
const requireForRender = createRequire(import.meta.url);
import assert from "node:assert/strict";
import { loadTypescript } from "./load-typescript.mjs";
const { mergeWatchedChanges, selectPersonalizedChanges } = loadTypescript("src/features/market/personalized-changes.ts");
const make = (symbol, ratio = 3, quotedAt = "2026-09-11T20:00:00Z") => ({
  quote: { symbol, name: symbol, quotedAt, price: 10, changePercent: 4 },
  sessionDate: "2026-09-11", signals: [{ kind: "volume", value: 300, baseline: 100, ratio }],
  story: { title: symbol + " earnings", url: "https://example.com/" + symbol },
});
const report = (item, change = item) => ({ quote: item.quote, change, story: item.story, previous: null, expiresAt: Date.now() + 60000 });
test("research adds a watched stock missing from public rankings and retains its own story", () => {
  const watched = make("WATCH");
  const merged = mergeWatchedChanges([make("PUBLIC")], ["WATCH"], { WATCH: report(watched) });
  assert.equal(merged.length, 2);
  assert.equal(merged[1].story.url, watched.story.url);
});
test("a newer quiet observation removes the old anomaly, without borrowing its news", () => {
  const prior = make("WATCH", 3, "2026-09-11T18:00:00Z");
  const quiet = make("WATCH");
  assert.equal(mergeWatchedChanges([prior], ["WATCH"], { WATCH: report(quiet, null) }).length, 0);
  assert.equal(mergeWatchedChanges([quiet], ["WATCH"], { WATCH: report(prior, null) }).length, 1);
});
test("missing news does not manufacture a representative card; removed account selections are ignored", () => {
  const item = make("WATCH");
  assert.equal(mergeWatchedChanges([], ["WATCH"], { WATCH: { ...report(item), story: null } }).length, 0);
  assert.equal(mergeWatchedChanges([], [], { WATCH: report(item) }).length, 0);
});
test("watched candidates lead, with public discovery retained and no duplicates", () => {
  const items = [make("PUBLIC1", 99), make("PUBLIC2", 98), make("W1", 10), make("W2", 8), make("W3", 7)];
  const chosen = selectPersonalizedChanges(items, ["W1", "W2", "W3"]);
  assert.deepEqual(Array.from(chosen, item => item.quote.symbol), ["W1", "W2", "PUBLIC1", "W3", "PUBLIC2"]);
  assert.equal(new Set(chosen.map(item => item.quote.symbol)).size, chosen.length);
});
test("filters and list limits apply to both personal and public candidates", () => {
  const volume = make("V");
  const price = { ...make("P"), signals: [{ kind: "price", value: 8, baseline: 2, ratio: 4 }] };
  assert.deepEqual(Array.from(selectPersonalizedChanges([volume, price], ["V"], "price"), item => item.quote.symbol), ["P"]);
  assert.equal(selectPersonalizedChanges([volume, price], ["V"], undefined, 1).length, 1);
});

test("quiet watched stocks keep a factual follow-up without inventing a signal or briefing role", () => {
  const React = requireForRender("react");
  const { renderToStaticMarkup } = requireForRender("react-dom/server");
  const quote = { symbol: "AAPL", name: "Apple", price: 200, changePercent: 0.4, currency: "USD", quotedAt: "2026-09-11T20:00:00Z" };
  let reports = { AAPL: { quote, change: null, story: { title: "Apple announces results", url: "https://example.com/apple", publisher: "Source", publishedAt: "2026-09-11T10:00:00Z" }, previous: { sessionDate: "2026-09-10", price: 199, changePercent: -0.5 } } };
  const { WatchlistPreview } = loadTypescript("src/components/WatchlistPreview.tsx", {
    "@/hooks/useWatchlist": { useWatchlist: () => ({ items: [{ symbol: "AAPL", name: "Apple" }], quotes: { AAPL: quote }, ready: true, failedSymbols: [], refresh: async () => {} }), formatWatchPrice: () => "$200" },
    "@/features/market/use-watched-reports": { useWatchedReports: () => reports },
    "@/components/AssetAvatar": { AssetAvatar: () => null },
    "./WatchlistPreview.module.css": { default: new Proxy({}, { get: (_, key) => String(key) }) },
  });
  let html = renderToStaticMarkup(React.createElement(WatchlistPreview));
  assert.match(html, /Apple announces results/);
  assert.match(html, /이전 거래일 기록/);
  assert.match(html, /2026-09-10/);
  assert.doesNotMatch(html, /보고|지난 방문|30초|<details|<summary/);
  reports = { AAPL: { ...reports.AAPL, previous: null, story: null } };
  html = renderToStaticMarkup(React.createElement(WatchlistPreview));
  assert.doesNotMatch(html, /이전 거래일 기록|기사가 없|뉴스 확인|보고/);
});
