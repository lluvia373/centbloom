import test from "node:test";
import assert from "node:assert/strict";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {loadTypescript} from "./load-typescript.mjs";
const {calendars,getMarketSession}=loadTypescript("src/features/market/schedule/index.ts");
const {localInstant}=loadTypescript("src/features/market/schedule/time.ts");
const calendar=id=>calendars.find(c=>c.id===id);
const at=(id,date)=>getMarketSession(calendar(id),Date.parse(date));
const iso=result=>result.nextAt ? new Date(result.nextAt).toISOString() : null;

test("US weekend skips Labor Day and opens Tuesday, using exchange-local date",()=>{
 const result=at("US","2026-09-06T07:00:00Z");
 assert.equal(result.label,"주말 휴장");
 assert.equal(result.skippedHoliday,"노동절");
 assert.equal(iso(result),"2026-09-08T13:30:00.000Z");
 assert.equal(at("US","2026-09-07T14:00:00Z").label,"노동절 휴장");
 // Already Saturday in Korea, still Friday's regular US session.
 assert.equal(at("US","2026-09-04T16:00:00Z").status,"open");
});
test("DST changes the UTC/KST opening time without changing local hours",()=>{
 assert.equal(new Date(localInstant("2026-03-06",570,"America/New_York")).toISOString(),"2026-03-06T14:30:00.000Z");
 assert.equal(new Date(localInstant("2026-03-09",570,"America/New_York")).toISOString(),"2026-03-09T13:30:00.000Z");
 assert.equal(new Date(localInstant("2026-11-02",570,"America/New_York")).toISOString(),"2026-11-02T14:30:00.000Z");
});
test("opening and closing use half-open boundaries, and ordinary closure is not a holiday",()=>{
 assert.equal(at("KR","2026-09-07T08:59:59+09:00").label,"개장 전");
 assert.equal(at("KR","2026-09-07T09:00:00+09:00").status,"open");
 assert.equal(at("KR","2026-09-07T15:29:59+09:00").status,"open");
 assert.equal(at("KR","2026-09-07T15:30:00+09:00").label,"장 마감");
});
test("Japanese lunch is separate from a holiday and shows the real resume time",()=>{
 assert.equal(at("JP","2026-09-07T11:29:59+09:00").nextAction,"점심 휴장");
 const lunch=at("JP","2026-09-07T11:30:00+09:00");
 assert.equal(lunch.label,"점심 휴장");
 assert.equal(iso(lunch),"2026-09-07T03:30:00.000Z");
 assert.equal(at("JP","2026-09-07T12:30:00+09:00").status,"open");
 assert.equal(at("JP","2026-09-07T15:00:00+09:00").status,"open"); // TSE now closes 15:30.
 assert.equal(at("JP","2026-09-22T12:00:00+09:00").label,"국민의 휴일 휴장");
});
test("Hong Kong midday pause and closing auction are not conflated with close",()=>{
 assert.equal(at("HK","2026-09-07T12:30:00+08:00").status,"break");
 assert.equal(at("HK","2026-09-07T16:00:00+08:00").status,"auction");
 assert.equal(at("HK","2026-09-07T16:10:00+08:00").label,"장 마감");
 assert.equal(at("HK","2026-12-24T12:05:00+08:00").status,"auction");
 assert.equal(at("HK","2026-12-24T12:10:00+08:00").label,"조기 마감");
});
test("US early close is 13:00 ET, July 2 2026 remains a full day",()=>{
 assert.equal(at("US","2026-11-27T12:59:59-05:00").status,"open");
 assert.equal(at("US","2026-11-27T13:00:00-05:00").label,"조기 마감");
 assert.equal(at("US","2026-07-02T14:00:00-04:00").status,"open");
 assert.equal(at("US","2026-07-03T10:00:00-04:00").label,"독립기념일 대체휴일 휴장");
});
test("China national holidays and official make-up weekend workdays do not open the exchange",()=>{
 const holiday=at("CN","2026-10-01T10:00:00+08:00");
 assert.equal(holiday.label,"국경절 휴장");
 assert.equal(iso(holiday),"2026-10-08T01:30:00.000Z");
 assert.equal(at("CN","2026-10-10T10:00:00+08:00").label,"주말 휴장");
 assert.equal(at("CN","2026-09-07T12:00:00+08:00").label,"점심 휴장");
});
test("Korean holidays include election, Constitution Day, substitutes, Chuseok and year end",()=>{
 for(const [date,reason] of [["06-03","지방선거일"],["07-17","제헌절"],["08-17","광복절 대체휴일"],["09-24","추석"],["12-31","연말"]])
  assert.equal(at("KR",`2026-${date}T10:00:00+09:00`).label,reason+" 휴장");
});
test("unverified years and special hours cannot silently produce a normal session or a guessed next opening",()=>{
 assert.equal(at("KR","2026-11-19T10:00:00+09:00").status,"unknown");
 assert.equal(iso(at("KR","2026-11-18T16:00:00+09:00")),null);
 for(const c of calendars) {
  assert.equal(getMarketSession(c,Date.parse("2027-01-04T12:00:00Z")).status,"unknown");
  assert.equal(getMarketSession(c,NaN).status,"unknown");
  assert.equal(iso(getMarketSession(c,Date.parse("2026-12-31T23:59:00-05:00"))),null);
 }
});
test("SSR renders reasons and all five countries without redundant labels or quote requests",()=>{
 const {MarketSessions}=loadTypescript("src/features/home/MarketSessions.tsx",{
  "./MarketSessions.module.css":{default:{}},
 });
 const html=renderToStaticMarkup(createElement(MarketSessions,{initialNow:Date.parse("2026-09-06T07:00:00Z")}));
 assert.equal((html.match(/<summary/g)||[]).length,5);
 assert.match(html,/노동절 후/);
 assert.match(html,/9\. 8\. 22:30 개장/);
 assert.doesNotMatch(html,/시장 현황|대표 지수 기준/);
 assert.match(html,/주말 휴장/);
});
