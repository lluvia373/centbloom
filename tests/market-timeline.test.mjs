import test from "node:test";
import assert from "node:assert/strict";
import { loadTypescript } from "./load-typescript.mjs";
const { calendars, kstTimelineDay, marketTimeline, rankMarketSessions, visibleMarketSessions, sessionTransition } = loadTypescript("src/features/market/schedule/index.ts");
const plot = (id, date) => marketTimeline(calendars.find(c => c.id === id), kstTimelineDay(Date.parse(date + "T12:00:00+09:00")));
const hours = result => Array.from(result.segments, s => [s.left * 24 / 100, s.width * 24 / 100].map(n => Math.round(n * 100) / 100));

test("KST day clips both US sessions and retains Friday's session on Saturday", () => {
  assert.deepEqual(hours(plot("US", "2026-09-09")), [[0, 5], [22.5, 1.5]]);
  assert.deepEqual(hours(plot("US", "2026-09-05")), [[0, 5]]);
  assert.equal(plot("US", "2026-09-06").segments.length, 0);
  assert.equal(plot("US", "2026-09-07").emptyLabel, "노동절 휴장");
  assert.deepEqual(hours(plot("US", "2026-09-08")), [[22.5, 1.5]]);
});
test("lunch splits the timeline and HK auction stays a separate segment", () => {
  assert.deepEqual(hours(plot("JP", "2026-09-08")), [[9, 2.5], [12.5, 3]]);
  const hk = plot("HK", "2026-09-08");
  assert.deepEqual(hours(hk).slice(0, 2), [[10.5, 2.5], [14, 3]]);
  assert.equal(hk.segments.at(-1).auction, true);
  assert.match(hk.description, /마감 경매.*이내 종료/);
});
test("DST and published early closures change bars rather than using standard hours", () => {
  assert.deepEqual(hours(plot("US", "2026-03-06")), [[0, 6], [23.5, .5]]);
  assert.deepEqual(hours(plot("US", "2026-03-10")), [[0, 5], [22.5, 1.5]]);
  assert.deepEqual(hours(plot("US", "2026-11-28")), [[0, 3]]);
  assert.deepEqual(hours(plot("GB", "2026-12-24")), [[0, 1.5], [17, 4.5]]);
});
test("unknown special hours and unknown years never receive invented regular bars", () => {
  const partial = plot("FR", "2026-12-24");
  assert.equal(partial.uncertain, true);
  assert.equal(partial.segments.length, 1); // Known end of the preceding session only.
  assert.match(partial.description, /일부 시간 미확인/);
  const unknown = plot("KR", "2027-01-04");
  assert.equal(unknown.segments.length, 0);
  assert.equal(unknown.emptyLabel, "거래시간 확인 중");
});
test("day rollover resets the current marker and all known intervals stay inside the axis", () => {
  assert.equal(kstTimelineDay(Date.parse("2026-09-08T00:00:00+09:00")).progress, 0);
  assert.equal(kstTimelineDay(Date.parse("2026-09-07T15:00:00Z")).date, "2026-09-08");
  for (const c of calendars) for (const date of ["2026-04-03", "2026-09-08", "2026-12-24"]) {
    for (const s of plot(c.id, date).segments) {
      assert.ok(s.left >= 0 && s.width > 0 && s.left + s.width <= 100.000001);
      assert.ok(s.startAt < s.endAt);
    }
  }
});
test("only the six primary markets remain visible in stable order", () => {
  for (const date of ["2026-09-07T08:30:00+09:00", "2026-09-08T14:00:00Z"]) {
    const ranked = rankMarketSessions(calendars, Date.parse(date));
    assert.deepEqual(Array.from(visibleMarketSessions(ranked), i => i.calendar.id), ["US", "KR", "JP", "CN", "HK", "DE"]);
  }
});
test("dated transition uses KST, never promises an exact HK auction end, handles missing time", () => {
  const next = (id, date) => {
    const now = Date.parse(date);
    return sessionTransition(rankMarketSessions(calendars, now).find(i => i.calendar.id === id), now);
  };
  assert.equal(next("KR", "2026-09-07T08:30:00+09:00").primary, "9/7 09:00 개장");
  assert.equal(next("JP", "2026-09-08T12:00:00+09:00").primary, "9/8 12:30 재개");
  assert.match(next("HK", "2026-09-08T17:09:00+09:00").primary, /17:10까지 마감/);
  assert.equal(next("KR", "2027-01-04T00:00:00Z").primary, "다음 일정 확인 중");
});
