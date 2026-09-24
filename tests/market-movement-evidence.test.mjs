import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTypescript } from "./load-typescript.mjs";

const moves = ["03", "04", "08", "09", "10"].map(day => ({ date: `2026-09-${day}`, percent: 1 }));
const make = (kind = "price") => ({
  quote: { symbol: "HPE", name: "Hewlett Packard Enterprise", price: 100, currency: "USD", changePercent: 12.44, quotedAt: "2026-09-11T20:00:00Z" },
  sessionDate: "2026-09-11",
  signals: [{ kind, value: kind === "price" ? 12.44 : 740, baseline: kind === "price" ? 3.04 : 100, ratio: kind === "price" ? 4.09 : 7.4 }],
  context: { recentMoves: moves, previousMaxMove: 7.75 },
});
const css = new Proxy({}, { get: (_, name) => String(name) });
function load({ cached, report = { loading: true, failed: false } } = {}) {
  return loadTypescript("src/features/market/MarketMovementEvidence.tsx", {
    react: { ...React, useEffect() {}, useState: () => [cached, () => {}] },
    "./use-market-changes": { getCachedMarketChange: () => cached },
    "./use-watched-reports": { useStockReport: () => ({ ...report, retry() {} }) },
    "./market-movement-evidence.module.css": { default: css },
  });
}
function renderContent(item) {
  return renderToStaticMarkup(React.createElement(load().MovementEvidenceContent, { item }));
}
function renderSection(options) {
  return renderToStaticMarkup(React.createElement(load(options).MarketMovementEvidence, { symbol: "HPE" }));
}

test("detail retains the exact prior-maximum versus average comparison rules", () => {
  const item = make();
  const html = renderContent(item);
  assert.match(html, /직전 20거래일 최대 등락폭/);
  assert.match(html, /<dd>7\.75%<\/dd>/);
  assert.doesNotMatch(html, /<dd>3\.04%<\/dd>/);
  for (const maximum of [undefined, 12.44, 12.435, 20]) {
    const other = renderContent({ ...item, context: { ...item.context, previousMaxMove: maximum } });
    assert.match(other, /직전 20거래일 평균 등락폭/);
    assert.match(other, /<dd>3\.04%<\/dd>/);
  }
  const combined = renderContent({ ...item, signals: [...item.signals, make("volume").signals[0]] });
  assert.match(combined, /큰 상승과 거래량 급증/);
  assert.match(combined, /직전 20거래일 평균 등락폭/);
  assert.match(combined, /3개월 하루 평균/);
});

test("volume, reversal and six observed sessions remain readable without a disclosure", () => {
  const html = renderContent(make("volume"));
  assert.match(html, /7\.4배/);
  assert.match(html, /740주/);
  assert.match(html, /100주/);
  assert.match(html, /직전 5거래일 \+ 이번 장/);
  assert.equal((html.match(/<time /g) ?? []).length, 6);
  assert.doesNotMatch(html, /<details|<summary/);
  assert.doesNotMatch(renderContent({ ...make(), context: { recentMoves: moves.slice(1) } }), /<time /);
  const reversal = renderContent({ ...make(), signals: [{ kind: "reversal", value: 12.44, baseline: 3, ratio: 3 }] });
  assert.match(reversal, /3거래일 연속 하락/);
  assert.match(reversal, /\+12\.44%/);
});

test("loading, failure, quiet result and unsupported assets are distinct", () => {
  assert.match(renderSection(), /변화 자료를 불러오고 있어요/);
  assert.match(renderSection({ report: { failed: true, loading: false } }), /불러오지 못했어요.*다시 시도/);
  assert.match(renderSection({ report: { data: { quote: make().quote, change: null } } }), /현재 확인된 특이 움직임이 없습니다/);
  assert.equal(renderSection({ report: { data: null } }), "");
  const ready = renderSection({ cached: { item: make(), expiresAt: Date.now() + 10_000 }, report: { failed: true } });
  assert.match(ready, /id="market-movement"/);
  assert.match(ready, /직전 20거래일 최대 등락폭/);
  assert.match(ready, /새 자료를 확인하지 못했어요/);
});

test("handoff selection keeps the correct symbol and newest observed session, including quiet replacement", () => {
  const { selectMovementEvidence } = load();
  const item = make();
  const cached = { item, expiresAt: 9999 };
  assert.equal(selectMovementEvidence("HPE", cached, undefined), item);
  assert.equal(selectMovementEvidence("MSFT", cached, undefined), undefined);
  const older = { quote: { ...item.quote, quotedAt: "2026-09-10T20:00:00Z" }, change: null };
  assert.equal(selectMovementEvidence("HPE", cached, older), item);
  assert.equal(selectMovementEvidence("HPE", cached, { quote: item.quote, change: null }), null);
  assert.equal(selectMovementEvidence("HPE", cached, { quote: { ...item.quote, symbol: "MSFT" }, change: null }), item);
});

test("public handoff survives home unsubscription only until its original expiry, without another public request", () => {
  const effects = [];
  const item = make();
  const feed = { items: [item], expiresAt: 200, access: "preview" };
  let snapshot = { loading: false, failed: false };
  const hook = loadTypescript("src/features/market/use-market-changes.ts", {
    react: { useCallback: fn => fn, useMemo: fn => fn(), useState: () => [0, () => {}],
      useEffect: fn => effects.push(fn), useSyncExternalStore: (_subscribe, _snapshot, serverSnapshot) => serverSnapshot() },
    "@/shared/async/polling-store": { createPollingStore: () => ({ empty: snapshot, snapshot: () => snapshot }) },
  });
  hook.useMarketChanges(feed);
  effects.at(-1)();
  assert.equal(hook.getCachedMarketChange("HPE", 199).item, item);
  assert.equal(hook.getCachedMarketChange("MSFT", 199), undefined);
  assert.equal(hook.getCachedMarketChange("HPE", 200), undefined);
  snapshot = { data: { items: [], expiresAt: 300 }, loading: false, failed: false };
  assert.equal(hook.getCachedMarketChange("HPE", 199), undefined);
});

test("single-stock observer preserves failed/unsupported states and expires shared data with stable snapshots", () => {
  const { createStockReportObserver } = loadTypescript("src/features/market/use-watched-reports.ts");
  let clock = 100;
  let current = { loading: true, failed: false };
  const requests = [];
  const observer = createStockReportObserver("HPE", { empty: current, snapshot: () => current, refresh: symbol => requests.push(symbol) }, () => clock);
  assert.equal(observer.snapshot(), current);
  current = { data: { quote: make().quote, change: make(), expiresAt: 200 }, loading: false, failed: false };
  assert.equal(observer.snapshot(), current);
  clock = 200;
  const expired = observer.snapshot();
  assert.equal(expired.data, undefined);
  assert.equal(expired.failed, true);
  assert.equal(observer.snapshot(), expired);
  observer.refresh();
  assert.deepEqual(requests, ["HPE"]);
  current = { data: null, loading: false, failed: false };
  assert.equal(observer.snapshot().data, null);
  current = { loading: false, failed: true };
  assert.equal(observer.snapshot(), current);
});

test("a watched-only report handoff shows instantly and a later quiet report replaces it", () => {
  const { createStockReportObserver } = loadTypescript("src/features/market/use-watched-reports.ts");
  let clock = 100;
  let current = { loading: true, failed: false };
  const report = { quote: make().quote, change: make(), expiresAt: 200 };
  const source = { empty: current, snapshot: () => current, refresh() {} };
  const observer = createStockReportObserver("HPE", source, () => clock, report);
  const initial = observer.snapshot();
  assert.equal(initial.data, report);
  assert.equal(observer.snapshot(), initial);
  clock = 200;
  assert.equal(observer.snapshot().data, undefined);
  current = { loading: false, failed: false, data: { ...report, change: null, expiresAt: 300 } };
  assert.equal(observer.snapshot().data.change, null);
  current = { loading: false, failed: false, data: null };
  assert.equal(observer.snapshot().data, null);
});
