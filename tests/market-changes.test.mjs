import test from "node:test";
import assert from "node:assert/strict";
import { loadTypescript } from "./load-typescript.mjs";

const { describeMarketChange, selectMarketChanges, marketSessionDate, changeObservation } = loadTypescript("src/features/market/market-changes.ts");
const now = Date.parse("2026-09-12T10:00:00Z");
const quote = { symbol: "TEST", name: "Test", price: 104, change: 4, changePercent: 4, currency: "USD", volume: 300, averageDailyVolume3Month: 100, quotedAt: "2026-09-11T20:00:00Z" };
const dates = Array.from({ length: 50 }, (_, i) => new Date(Date.parse("2026-07-23") + i * 86400_000))
  .filter(date => date.getUTCDay() !== 0 && date.getUTCDay() !== 6).map(date => date.toISOString().slice(0, 10)).slice(-21);
const history = dates.map((date, i) => ({ date, close: i % 2 ? 101 : 100 }));

test("volume uses the explicit three-month daily mean and ignores missing/zero baselines", () => {
  const item = describeMarketChange(quote, [], now);
  assert.equal(item.signals[0].ratio, 3);
  assert.equal(item.sessionDate, "2026-09-11");
  for (const average of [undefined, 0, NaN, Infinity, -1]) assert.equal(describeMarketChange({ ...quote, averageDailyVolume3Month: average }, [], now), null);
  assert.equal(describeMarketChange({ ...quote, volume: 199 }, [], now), null);
});
test("20 historical absolute daily returns exclude the quote's current session", () => {
  const item = describeMarketChange(quote, [...history, { date: "2026-09-11", close: 900 }], now);
  const signal = item.signals.find(signal => signal.kind === "price");
  assert.ok(signal);
  assert.ok(Math.abs(signal.baseline - (1 + 100 / 101) / 2) < 0.00001);
  assert.equal(signal.value, 4);
  assert.equal(describeMarketChange(quote, history.slice(1), now).signals.some(s => s.kind === "price"), false);
});
test("mismatched prices, history gaps and large adjustment changes suppress price claims", () => {
  const histories = [
    history.map(point => ({ ...point, close: point.close * 2 })),
    history.map((point, i) => i === 0 ? { ...point, date: "2026-01-01" } : point),
    history.map((point, i) => ({ ...point, adjustedClose: point.close * (i < 10 ? 0.5 : 1) })),
  ];
  for (const rows of histories) assert.deepEqual(Array.from(describeMarketChange(quote, rows, now).signals, signal => signal.kind), ["volume"]);
});
test("reversal counts only the uninterrupted preceding streak and requires a real turn", () => {
  const rows = dates.slice(-5).map((date, i) => ({ date, close: [103, 104, 103, 102, 100][i] }));
  assert.equal(describeMarketChange(quote, rows, now).signals.find(s => s.kind === "reversal").baseline, 3);
  assert.equal(describeMarketChange({ ...quote, price: 100.1, change: 0.1, changePercent: 0.1 }, rows, now).signals.some(s => s.kind === "reversal"), false);
  assert.equal(describeMarketChange(quote, rows.slice(1), now).signals.some(s => s.kind === "reversal"), false);
});
test("stale, future or missing quote dates cannot be presented as current changes", () => {
  for (const quotedAt of [undefined, "bad", "2026-08-01", "2026-09-13"]) assert.equal(describeMarketChange({ ...quote, quotedAt }, history, now), null);
  assert.equal(marketSessionDate("2026-09-12T00:00:00Z"), "2026-09-11");
});
test("observation connects concurrent signals without losing them in filtered views", () => {
  const item = describeMarketChange(quote, history, now);
  const filtered = selectMarketChanges([item], "price")[0];
  assert.equal(filtered.signals[0].kind, "price");
  assert.equal(filtered.signals.length, 2);
  assert.match(changeObservation(filtered).headline, /큰 상승과 거래량 급증/);
  const quiet = describeMarketChange({ ...quote, price: 100.5, change: 0.5, changePercent: 0.5 }, history, now);
  assert.match(changeObservation(quiet).headline, /소폭 상승/);
  const flat = describeMarketChange({ ...quote, price: 100, change: 0, changePercent: 0 }, history, now);
  assert.match(changeObservation(flat).headline, /보합/);
});
test("recent context excludes the current session and never invents a 20-day maximum", () => {
  const item = describeMarketChange({ ...quote, averageDailyVolume3Month: undefined }, [...history, { date: "2026-09-11", close: 900 }], now);
  assert.equal(item.context.recentMoves.length, 5);
  assert.ok(item.context.recentMoves.every(move => move.date < item.sessionDate));
  assert.ok(Math.abs(item.context.previousMaxMove - 1) < 0.00001);
  assert.match(changeObservation(item).headline, /20거래일의 최대 등락폭/);
  const short = describeMarketChange(quote, history.slice(-6), now);
  assert.equal(short.context.previousMaxMove, undefined);
  assert.equal(describeMarketChange(quote, [], now).context, undefined);
});
test("selection keeps stocks unique, represents different signals, and filters before limiting", () => {
  const make = (symbol, kinds, ratio) => ({ quote: { ...quote, symbol }, sessionDate: "2026-09-11", signals: kinds.map(kind => ({ kind, value: 4, baseline: 1, ratio })) });
  const items = [make("A", ["volume", "price"], 9), make("B", ["volume"], 8), make("C", ["price"], 5), make("D", ["reversal"], 3)];
  const selected = selectMarketChanges(items);
  assert.deepEqual(Array.from(selected, item => item.quote.symbol), ["A", "C", "D"]);
  assert.deepEqual(Array.from(selectMarketChanges(items, "price"), item => item.quote.symbol), ["A", "C"]);
  assert.equal(new Set(selectMarketChanges(items, undefined, 9).map(item => item.quote.symbol)).size, 4);
});

test("history failure retains independently verified volume changes and marks partial coverage", async () => {
  const { fetchMarketChanges } = loadTypescript("src/features/market/server/market-changes.ts", {
    "./movers": { fetchMovers: async kind => ({ kind, quotes: [{ ...quote, quotedAt: new Date().toISOString() }], total: 1, fetchedAt: new Date().toISOString() }) },
    "./chart": { fetchChart: async () => { throw new Error("unavailable"); } },
    "./provider": { MarketError: Error },
  });
  const data = await fetchMarketChanges();
  assert.equal(data.examined, 1);
  assert.equal(data.historyUnavailable, 1);
  assert.equal(data.partial, true);
  assert.equal(data.items[0].signals[0].kind, "volume");
});
