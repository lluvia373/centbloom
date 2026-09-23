import test from "node:test";
import assert from "node:assert/strict";
import { loadTypescript } from "./load-typescript.mjs";

const { getMarketOverview, getMarketPanelTabs, getMarketPanelPage } = loadTypescript("src/features/market/market-overview.ts");
const { calendars, getLastMarketClose } = loadTypescript("src/features/market/schedule/index.ts");
const { tickerInstruments } = loadTypescript("src/features/market/ticker-instruments.ts");
const overview = date => getMarketOverview(Date.parse(date));
const ids = groups => Array.from(groups, group => group.id);
const close = (id, date) => getLastMarketClose(calendars.find(calendar => calendar.id === id), Date.parse(date));
const iso = value => value === undefined ? undefined : new Date(value).toISOString();
const panelSymbols = items => Array.from(items, item => item.instrument.symbol);

test("regional panel tabs expose all 18 instruments in fixed country and member order at every schedule state", () => {
  const expectedRegions = [
    ["us", "미국", ["^GSPC", "^IXIC", "^NDX", "^DJI", "^RUT", "^SOX"]],
    ["asia", "아시아", ["^KS11", "^KQ11", "^N225", "^HSI", "000001.SS"]],
    ["europe", "유럽", ["^GDAXI", "^FTSE"]],
    ["reference", "기타", ["^VIX", "^STOXX50E", "^TNX", "DX-Y.NYB", "USDKRW=X"]],
  ];
  for (const date of ["2026-09-08T10:45:00+09:00", "2026-09-08T14:00:00Z", "2026-09-08T13:00:00+09:00", "2026-09-12T12:00:00Z", "2027-01-04T12:00:00Z"]) {
    const result = overview(date);
    const tabs = getMarketPanelTabs(result);
    assert.deepEqual(Array.from(tabs.slice(1), tab => [tab.id, tab.label, panelSymbols(tab.items)]), expectedRegions);
    const regionalSymbols = Array.from(tabs).slice(1).flatMap(tab => panelSymbols(tab.items));
    assert.equal(regionalSymbols.length, 18);
    assert.equal(new Set(regionalSymbols).size, 18);
    assert.deepEqual([...regionalSymbols].sort(), Array.from(tickerInstruments, item => item.symbol).sort());
    assert.deepEqual(panelSymbols(tabs[0].items), Array.from(result.featured).flatMap(group => Array.from(group.instruments, item => item.symbol)));
    for (const tab of tabs) {
      assert.equal(new Set(panelSymbols(tab.items)).size, tab.items.length);
      for (const item of tab.items) {
        assert.ok([...result.featured, ...result.remaining].includes(item.group));
        assert.ok(item.group.instruments.includes(item.instrument));
      }
    }
  }
});

test("featured panel label follows open, recent-close and unknown-schedule fallback modes", () => {
  for (const [date, label] of [
    ["2026-09-08T10:45:00+09:00", "장중"],
    ["2026-09-12T12:00:00Z", "최근 마감"],
    ["2027-01-04T12:00:00Z", "대표"],
    ["invalid", "대표"],
  ]) {
    const featured = getMarketPanelTabs(overview(date))[0];
    assert.equal(featured.id, "featured");
    assert.equal(featured.label, label);
  }
});

test("panel pages show two US instruments across three pages and keep the final Asia singleton", () => {
  const tabs = getMarketPanelTabs(overview("2026-09-08T10:45:00+09:00"));
  const us = tabs.find(tab => tab.id === "us");
  for (const [page, expected] of [[0, ["^GSPC", "^IXIC"]], [1, ["^NDX", "^DJI"]], [2, ["^RUT", "^SOX"]]]) {
    const result = getMarketPanelPage(us, page);
    assert.equal(result.page, page);
    assert.equal(result.pageCount, 3);
    assert.deepEqual(panelSymbols(result.items), expected);
  }
  const asia = getMarketPanelPage(tabs.find(tab => tab.id === "asia"), 2);
  assert.equal(asia.page, 2);
  assert.equal(asia.pageCount, 3);
  assert.deepEqual(panelSymbols(asia.items), ["000001.SS"]);
});

test("panel page boundaries clamp invalid indices and allow an empty tab without changing source items", () => {
  const us = getMarketPanelTabs(overview("2026-09-08T10:45:00+09:00")).find(tab => tab.id === "us");
  const original = panelSymbols(us.items);
  for (const [requested, expected] of [[-2, 0], [100, 2], [1.8, 1], [NaN, 0], [Infinity, 0], [-Infinity, 0]]) {
    const result = getMarketPanelPage(us, requested);
    assert.equal(result.page, expected);
    assert.equal(result.pageCount, 3);
    assert.deepEqual(panelSymbols(result.items), original.slice(expected * 2, expected * 2 + 2));
  }
  assert.deepEqual(panelSymbols(us.items), original);
  const empty = getMarketPanelPage({ ...us, items: [] }, 100);
  assert.equal(empty.page, 0);
  assert.equal(empty.pageCount, 1);
  assert.deepEqual(panelSymbols(empty.items), []);
});

test("all 18 original instruments occur once across featured and remaining with stable group/member order", () => {
  for (const date of ["2026-09-08T10:45:00+09:00", "2026-09-08T14:00:00Z", "2026-09-12T12:00:00Z", "2027-01-04T12:00:00Z"]) {
    const result = overview(date);
    const all = [...result.featured, ...result.remaining];
    const symbols = all.flatMap(group => Array.from(group.instruments, item => item.symbol));
    assert.equal(symbols.length, 18);
    assert.equal(new Set(symbols).size, 18);
    assert.deepEqual([...symbols].sort(), Array.from(tickerInstruments, item => item.symbol).sort());
    assert.deepEqual(Array.from(all.find(group => group.id === "US").instruments, item => item.symbol), ["^GSPC", "^IXIC", "^NDX", "^DJI", "^RUT", "^SOX"]);
    for (const group of all) assert.deepEqual(Array.from(group.instruments, item => [item.symbol, item.label, item.note]), Array.from(tickerInstruments.filter(item => group.instruments.some(member => member.symbol === item.symbol)), item => [item.symbol, item.label, item.note]));
    const reference = all.find(group => group.id === "REFERENCE");
    assert.deepEqual(Array.from(reference.instruments, item => item.symbol), ["^VIX", "^STOXX50E", "^TNX", "DX-Y.NYB", "USDKRW=X"]);
    assert.equal(reference.state, undefined);
    assert.equal(reference.lastClosedAt, undefined);
    assert.ok(result.remaining.includes(reference));
  }
});

test("only open markets lead, using fixed country order rather than approaching openings or price changes", () => {
  const asia = overview("2026-09-08T10:45:00+09:00");
  assert.equal(asia.mode, "open");
  assert.deepEqual(ids(asia.featured), ["KR", "JP", "HK", "CN"]);
  assert.deepEqual(ids(asia.remaining), ["US", "DE", "GB", "REFERENCE"]);
  assert.deepEqual(ids(overview("2026-09-08T14:00:00Z").featured), ["US", "DE", "GB"]);
  assert.deepEqual(ids(overview("2026-09-08T12:00:00+09:00").featured), ["KR", "HK", "CN"]);
  assert.deepEqual(ids(overview("2026-09-08T13:00:00+09:00").featured), ["KR", "JP"]);
  const auction = overview("2026-09-08T16:05:00+08:00");
  assert.ok(!ids(auction.featured).includes("HK"));
  assert.equal(auction.remaining.find(group => group.id === "HK").state.status, "auction");
});

test("holiday closures and the latest simultaneous completed sessions drive closed-market fallback", () => {
  assert.deepEqual(ids(overview("2026-09-23T10:45:00+09:00").featured), ["KR", "HK", "CN"]);
  const weekend = overview("2026-09-12T12:00:00Z");
  assert.equal(weekend.mode, "recent-close");
  assert.deepEqual(ids(weekend.featured), ["US"]);
  assert.equal(iso(weekend.featured[0].lastClosedAt), "2026-09-11T20:00:00.000Z");
  // The US Labor Day closure leaves the two European sessions as the most recent closes.
  const holiday = overview("2026-09-07T18:00:00Z");
  assert.equal(holiday.mode, "recent-close");
  assert.deepEqual(ids(holiday.featured), ["DE", "GB"]);
  assert.equal(iso(holiday.featured[0].lastClosedAt), "2026-09-07T15:30:00.000Z");
});

test("last close is the full session end, not lunch or the start of Hong Kong closing auction", () => {
  assert.equal(iso(close("JP", "2026-09-08T12:00:00+09:00")), "2026-09-07T06:30:00.000Z");
  assert.equal(iso(close("JP", "2026-09-24T12:00:00+09:00")), "2026-09-18T06:30:00.000Z");
  assert.equal(iso(close("CN", "2026-09-08T12:00:00+08:00")), "2026-09-07T07:00:00.000Z");
  assert.equal(iso(close("HK", "2026-09-08T16:09:59+08:00")), "2026-09-07T08:10:00.000Z");
  assert.equal(iso(close("HK", "2026-09-08T16:10:00+08:00")), "2026-09-08T08:10:00.000Z");
});

test("last close honors US/European DST, half days, and holiday weekends", () => {
  assert.equal(iso(close("US", "2026-03-06T22:00:00Z")), "2026-03-06T21:00:00.000Z");
  assert.equal(iso(close("US", "2026-03-09T22:00:00Z")), "2026-03-09T20:00:00.000Z");
  assert.equal(iso(close("DE", "2026-03-27T18:00:00Z")), "2026-03-27T16:30:00.000Z");
  assert.equal(iso(close("DE", "2026-03-30T18:00:00Z")), "2026-03-30T15:30:00.000Z");
  assert.equal(iso(close("US", "2026-11-27T18:00:00Z")), "2026-11-27T18:00:00.000Z");
  assert.equal(iso(close("GB", "2026-12-24T12:30:00Z")), "2026-12-24T12:30:00.000Z");
  assert.equal(iso(close("HK", "2026-12-24T12:10:00+08:00")), "2026-12-24T04:10:00.000Z");
  assert.equal(iso(close("US", "2026-09-07T14:00:00Z")), "2026-09-04T20:00:00.000Z");
});

test("unknown schedules and newer unverified special sessions never invent a last close", () => {
  for (const date of ["2027-01-04T12:00:00Z", "2025-12-31T12:00:00Z", "invalid"]) {
    const result = overview(date);
    assert.equal(result.mode, "default");
    assert.equal(result.featuredTitle, "기본 대표 지수");
    assert.deepEqual(ids(result.featured), ["US"]);
    assert.equal(result.featured[0].state.status, "unknown");
    assert.ok([...result.featured, ...result.remaining].every(group => group.lastClosedAt === undefined));
  }
  assert.equal(close("KR", "2026-11-19T16:00:00+09:00"), undefined);
  assert.equal(close("KR", "2026-11-20T08:00:00+09:00"), undefined);
  assert.equal(iso(close("KR", "2026-11-20T15:30:00+09:00")), "2026-11-20T06:30:00.000Z");
  assert.equal(close("US", "2026-01-01T12:00:00Z"), undefined);
  const partialUnknown = overview("2026-11-19T08:00:00+09:00");
  assert.equal(partialUnknown.mode, "default");
  assert.deepEqual(ids(partialUnknown.featured), ["US"]);
  assert.equal(partialUnknown.remaining.find(group => group.id === "KR").state.status, "unknown");
  // An independently confirmed open market can still lead while another schedule is unknown.
  assert.deepEqual(ids(overview("2026-11-19T10:45:00+09:00").featured), ["JP", "HK", "CN"]);
});
