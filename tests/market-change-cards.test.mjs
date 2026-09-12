import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTypescript } from "./load-typescript.mjs";

const moves = ["03", "04", "08", "09", "10"].map(day => ({ date: `2026-09-${day}`, percent: 1 }));
const make = (symbol, kind = "price") => ({
  quote: { symbol, name: symbol, price: 100, currency: "USD", changePercent: 12.44 },
  sessionDate: "2026-09-11",
  signals: [{ kind, value: kind === "price" ? 12.44 : 740, baseline: kind === "price" ? 3.04 : 100, ratio: kind === "price" ? 4.09 : 7.4 }],
  context: { recentMoves: moves, previousMaxMove: 7.75 },
  story: { id: symbol, title: `${symbol} reports results`, publisher: "Example News", url: `https://example.com/${symbol}`, publishedAt: "2026-09-11T20:00:00Z", symbols: [symbol] },
});

function render(items, { selected, page = 0, failed = false, partial = false, missing = false, watched = [], reports = {} } = {}) {
  let stateIndex = 0;
  const state = [selected, page];
  const { MarketChanges } = loadTypescript("src/features/home/MarketChanges.tsx", {
    react: { ...React, useState: () => [state[stateIndex++], () => {}] },
    "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
    "@/components/AssetAvatar": { AssetAvatar: () => null },
    "@/features/watchlist/WatchStockButton": { WatchStockButton: () => null },
    "@/features/market/use-market-changes": { useMarketChanges: () => ({ data: missing ? null : { items, examined: items.length, partial }, failed, retry() {} }) },
    "@/hooks/useWatchlist": { useWatchlist: () => ({ items: watched.map(symbol => ({ symbol })) }) },
    "@/features/market/use-watched-reports": { useWatchedReports: () => reports },
    "./HomeSection": { HomeSection: ({ title, actions, children }) => React.createElement("section", null, React.createElement("h2", null, title), actions, children) },
    "./home.module.css": { default: new Proxy({}, { get: (_, name) => String(name) }) },
  });
  return renderToStaticMarkup(React.createElement(MarketChanges));
}

test("maximum-breakout headline and bars use the same prior maximum; other cases retain average", () => {
  const item = make("HPE");
  const html = render([item]);
  assert.match(html, /직전 20거래일 최대 등락폭/);
  assert.match(html, /<strong>7\.75%<\/strong>/);
  assert.doesNotMatch(html, /<strong>3\.04%<\/strong>/);
  for (const maximum of [undefined, 12.44, 12.435, 20]) {
    const other = render([{ ...item, context: { ...item.context, previousMaxMove: maximum } }]);
    assert.match(other, /직전 20거래일 평균 등락폭/);
    assert.match(other, /<strong>3\.04%<\/strong>/);
  }
  const combined = render([{ ...item, signals: [...item.signals, make("HPE", "volume").signals[0]] }], { selected: "price" });
  assert.match(combined, /큰 상승과 거래량 급증/);
  assert.match(combined, /직전 20거래일 평균 등락폭/);
});

test("volume metric remains a ratio and six observed dates are visible without disclosure", () => {
  const html = render([make("KHC", "volume")]);
  assert.match(html, /7\.4<small>배<\/small>/);
  assert.match(html, /직전 5거래일 \+ 이번 장/);
  assert.equal((html.match(/<time /g) ?? []).length, 6);
  assert.doesNotMatch(html, /<details|<summary/);
  assert.doesNotMatch(render([{ ...make("KHC"), context: { recentMoves: moves.slice(1) } }]), /<time /);
});

test("pagination, filter changes and shrinking feeds always show valid groups of three", () => {
  const items = Array.from({ length: 7 }, (_, i) => make(`T${i}`));
  const first = render(items);
  assert.equal((first.match(/<article /g) ?? []).length, 3);
  assert.match(first, /1 \/ 3/);
  const second = render(items, { page: 1 });
  assert.match(second, /href="\/stock\/T3"/);
  assert.doesNotMatch(second, /href="\/stock\/T0"/);
  assert.equal((render(items, { page: 99 }).match(/<article /g) ?? []).length, 1);
  const reset = render(items, { selected: "volume", page: 2 });
  assert.match(reset, /1 \/ 3/);
  assert.doesNotMatch(reset, />거래량 급증<\/button>/);
});

test("cached research stays visible; empty research hides the section and initial failure offers retry", () => {
  for (const state of [{ failed: true }, { partial: true }]) {
    const html = render([make("HPE")], state);
    assert.match(html, /href="https:\/\/example.com\/HPE"/);
    assert.doesNotMatch(html, /갱신 실패|일부 비교 자료|다시 시도|종목에서 뉴스 확인/);
  }
  assert.equal(render([]), "");
  const failed = render([], { missing: true, failed: true });
  assert.match(failed, /움직임을 불러오지 못했어요/);
  assert.match(failed, /다시 시도/);
  assert.doesNotMatch(failed, /<article /);
  assert.match(render([], { missing: true }), /시장 움직임을 불러오고 있어요/);
});

test("watched reports join public discoveries using the same metric and article layout", () => {
  const personal = make("MY", "volume");
  const html = render([make("PUBLIC")], {
    watched: ["MY"], reports: { MY: { quote: personal.quote, change: personal, story: personal.story } },
  });
  assert.equal((html.match(/<article /g) ?? []).length, 2);
  assert.ok(html.indexOf('href="/stock/MY"') < html.indexOf('href="/stock/PUBLIC"'));
  assert.match(html, /7\.4<small>배<\/small>/);
  assert.match(html, /href="https:\/\/example.com\/MY"/);
});
