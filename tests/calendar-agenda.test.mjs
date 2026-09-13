import test from "node:test";
import assert from "node:assert/strict";
import { loadTypescript } from "./load-typescript.mjs";

const { selectAgenda, agendaObservation } = loadTypescript("src/features/calendar/agenda.ts");
const { calendarQuery } = loadTypescript("src/features/calendar/server/query.ts");
const now = Date.parse("2026-09-13T03:00:00Z"); // Sunday, noon in Korea.
const event = (id, at, overrides = {}) => ({
  id, at, title: "미국 소비자물가지수", detail: "월간 발표",
  source: { label: "발표기관", url: "https://example.test" },
  seriesKey: "schedule:CPI", actual: null, forecast: null, previous: null,
  previousOriginal: null, unit: "%", updatedAt: null, timingEstimated: false,
  ...overrides,
});
const earnings = (id, at, symbol, actual = null) => event(id, at, {
  kind: "earnings", title: symbol + " 실적 발표", seriesKey: "earnings:" + symbol,
  earnings: { symbol, currency: "USD", eps: { actual, forecast: null, previous: null },
    revenue: { actual: null, forecast: null, previous: null } },
});
const ids = records => Array.from(records, item => item.id);

test("home looks beyond Sunday into the next 45 KST dates and selects five defined economic releases in time order", () => {
  const events = [
    event("pce", "2026-09-30T12:30:00Z", { title: "미국 PCE 물가·개인소비" }),
    event("retail", "2026-09-16T12:30:00Z", { title: "미국 소매판매" }),
    event("inventory", "2026-09-16T14:00:00Z", { title: "미국 기업 재고·판매" }),
    event("fomc", "2026-09-16T18:00:00Z", { title: "미국 FOMC 금리 결정" }),
    event("press", "2026-09-16T18:30:00Z", { title: "연준 기자회견" }),
    event("gdp", "2026-09-30T12:00:00Z", { title: "미국 GDP 확정치" }),
    event("jobs", "2026-10-02T12:30:00Z", { title: "미국 고용보고서" }),
    event("cpi", "2026-10-14T12:30:00Z"),
    event("far", "2026-10-29T00:00:00+09:00"),
  ];
  const originalOrder = ids(events);
  assert.deepEqual(ids(selectAgenda(events, now).upcoming), ["retail", "fomc", "gdp", "pce", "jobs"]);
  assert.deepEqual(ids(events), originalOrder);
  assert.deepEqual(ids(selectAgenda([
    event("last-day", "2026-10-28T23:59:59+09:00"),
    event("outside", "2026-10-29T00:00:00+09:00"),
  ], now).upcoming), ["last-day"]);
});

test("economic releases need no watchlist; home earnings belong only to watched symbols", () => {
  const events = [
    event("economic", "2026-09-15T12:30:00Z"),
    earnings("apple", "2026-09-16T12:30:00Z", "AAPL"),
    earnings("other", "2026-09-17T12:30:00Z", "OTHER"),
    earnings("past-apple", "2026-09-12T12:30:00Z", "AAPL", "0"),
    earnings("past-other", "2026-09-12T13:30:00Z", "OTHER", "1"),
  ];
  assert.deepEqual(ids(selectAgenda(events, now).upcoming), ["economic"]);
  assert.deepEqual(ids(selectAgenda(events, now).recent), []);
  const selected = selectAgenda(events, now, [" aapl "]);
  assert.deepEqual(ids(selected.upcoming), ["economic", "apple"]);
  assert.deepEqual(ids(selected.recent), ["past-apple"]);
});

test("unknown release times remain upcoming for the whole KST date, while known past times do not", () => {
  const selected = selectAgenda([
    event("unknown-today", "2026-09-12T15:00:00Z", { timingEstimated: true }),
    event("known-past", "2026-09-13T02:59:59Z"),
    event("unknown-yesterday", "2026-09-12T14:59:59Z", { timingEstimated: true }),
    event("known-now", "2026-09-13T03:00:00Z"),
  ], now);
  assert.deepEqual(ids(selected.upcoming), ["unknown-today", "known-now"]);
  assert.deepEqual(ids(selected.recent), []);
});

test("recent results require real values, include zero and stop at two within the seven-day KST lookback", () => {
  const selected = selectAgenda([
    event("latest", "2026-09-13T02:00:00Z", { actual: "0" }),
    event("second", "2026-09-12T12:30:00Z", { actual: "2.4" }),
    event("third", "2026-09-11T12:30:00Z", { actual: "2.3" }),
    event("elapsed-only", "2026-09-13T01:00:00Z"),
    event("future-value", "2026-09-14T00:00:00Z", { actual: "2.5" }),
    event("irrelevant", "2026-09-13T02:30:00Z", { title: "도매 재고", actual: "1" }),
  ], now);
  assert.deepEqual(ids(selected.recent), ["latest", "second"]);
  assert.deepEqual(ids(selectAgenda([
    event("first-day", "2026-09-06T00:00:00+09:00", { actual: "1" }),
    event("older", "2026-09-05T23:59:59+09:00", { actual: "1" }),
  ], now).recent), ["first-day"]);
});

test("same IDs select the freshest update and never duplicate a schedule and its result", () => {
  const at = "2026-09-12T12:30:00Z";
  const pending = event("cpi", at, { updatedAt: "2026-09-12T12:00:00Z" });
  const actual = event("cpi", at, { actual: "2.5", updatedAt: "2026-09-12T12:31:00Z" });
  const corrected = event("cpi", at, { actual: "2.4", updatedAt: "2026-09-12T12:32:00Z" });
  const selected = selectAgenda([corrected, pending, actual, corrected], now);
  assert.deepEqual(ids(selected.recent), ["cpi"]);
  assert.equal(selected.recent[0].actual, "2.4");
  assert.deepEqual(ids(selectAgenda([event("invalid", "not-a-date")], now).upcoming), []);
});

test("English titles use the same fixed scope and observations compare specific measures without forecasts", () => {
  const titles = ["Inflation Rate YoY", "PPI MoM", "Non Farm Payrolls", "Retail Sales MoM", "Fed Interest Rate Decision", "GDP Growth Rate QoQ", "Core PCE Price Index MoM"];
  for (const title of titles) {
    const release = event(title, "2026-09-15T00:00:00Z", { title });
    assert.equal(selectAgenda([release], now).upcoming.length, 1, title);
    assert.notEqual(agendaObservation(release), release.detail, title);
    assert.doesNotMatch(agendaObservation(release), /매수|매도|주가.*상승|주가.*하락|확실/);
  }
  assert.match(agendaObservation(event("jobs", "2026-09-15", { title: "미국 고용보고서" })), /일자리.*실업률.*지난달/);
  assert.match(agendaObservation(earnings("aapl", "2026-09-15", "AAPL")), /매출.*주당순이익.*시장 예상/);
  assert.equal(agendaObservation(event("other", "2026-09-15", { title: "다른 일정", detail: "원래 설명" })), "원래 설명");
});

test("agenda API covers seven previous days through the full 45th future day in KST and keeps legacy queries", () => {
  const query = calendarQuery(new URLSearchParams("agenda=2026-09-13"));
  assert.equal(query.from, "2026-09-05T15:00:00.000Z");
  assert.equal(query.to, "2026-10-28T15:00:00.000Z");
  const yearBoundary = calendarQuery(new URLSearchParams("agenda=2026-12-31"));
  assert.equal(yearBoundary.from, "2026-12-23T15:00:00.000Z");
  assert.equal(yearBoundary.to, "2027-02-14T15:00:00.000Z");
  for (const params of ["agenda=", "agenda=2026-02-30", "agenda=2026-09-13&week=2026-09-14", "agenda=2026-09-13&event=cpi-09"]) {
    assert.equal(calendarQuery(new URLSearchParams(params)), null);
  }
  assert.equal(calendarQuery(new URLSearchParams("week=2026-09-14")).to, "2026-09-20T15:00:00.000Z");
  assert.equal(calendarQuery(new URLSearchParams("month=2026-09")).to, "2026-09-30T15:00:00.000Z");
  assert.equal(calendarQuery(new URLSearchParams("event=cpi-09")).id, "cpi-09");
  assert.equal(calendarQuery(new URLSearchParams("series=bls:US:CPI:MOM:SA")).series, "bls:US:CPI:MOM:SA");
  assert.equal(calendarQuery(new URLSearchParams("series=te:US:CPIMOM")).series, "te:US:CPIMOM");
});
