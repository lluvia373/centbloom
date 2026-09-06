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
test("SSR renders simultaneous closures and region navigation without explanatory popovers",()=>{
 const {MarketSessions}=loadTypescript("src/features/home/MarketSessions.tsx",{
  "./MarketSessions.module.css":{default:{}},
 });
 const html=renderToStaticMarkup(createElement(MarketSessions,{initialNow:Date.parse("2026-09-06T07:00:00Z")}));
 assert.doesNotMatch(html, /<summary|<details|상세 일정과 출처|한국시간/);
 assert.match(html,/data-alert-markets="US,CA"/);
 assert.match(html,/유럽/);
 assert.match(html,/정규장 · KST/);
 assert.match(html,/노동절 휴장 예정/);
 assert.match(html,/9\. 8\. 22:30 개장/);
 assert.doesNotMatch(html,/시장 현황|대표 지수 기준/);
 assert.match(html,/주말 휴장/);
});

test("session priority changes with time rather than a fixed country order",()=>{
 const {rankMarketSessions}=loadTypescript("src/features/market/schedule/index.ts");
 const rank=date=>rankMarketSessions(calendars.filter(c=>["US","KR","JP","HK","CN"].includes(c.id)),Date.parse(date));
 assert.ok(rank("2026-09-06T07:00:00Z").find(i=>i.calendar.id==="US").alert.label.includes("노동절"));
 const opening=rank("2026-09-07T08:30:00+09:00")[0];
 assert.equal(opening.calendar.id,"KR");assert.equal(opening.remaining,30*60_000);
 const lunch=rank("2026-09-08T12:00:00+09:00")[0];
 assert.equal(lunch.calendar.id,"JP");assert.equal(lunch.state.nextAction,"재개");
 assert.equal(rank("2026-09-08T14:00:00Z")[0].calendar.id,"US");
 assert.equal(rank("2026-09-08T06:00:00Z")[0].remaining,30*60_000);
 assert.equal(calendars[0].id,"US");
});
test("unknown schedules stay honest and equal priorities remain stable",()=>{
 const {rankMarketSessions}=loadTypescript("src/features/market/schedule/index.ts");
 const unknown=rankMarketSessions(calendars,Date.parse("2027-01-04T12:00:00Z"));
 assert.deepEqual(Array.from(unknown,item=>item.calendar.id),Array.from(calendars,item=>item.id));
 assert.ok(unknown.every(item=>item.state.status==="unknown" && item.state.nextAt===undefined));
 const invalid=rankMarketSessions(calendars,NaN);
 assert.ok(invalid.every(item=>item.state.status==="unknown"));
});

test("Europe uses exchange holidays rather than national holidays, and observes its own DST",()=>{
 assert.equal(at("GB","2026-08-31T10:00:00Z").label,"여름 은행휴일 휴장");
 assert.equal(at("DE","2026-08-31T10:00:00Z").status,"open");
 assert.equal(at("FR","2026-05-14T10:00:00Z").status,"open");
 assert.equal(at("CH","2026-05-14T10:00:00Z").label,"승천일 휴장");
 assert.equal(at("DK","2026-05-01T10:00:00Z").status,"open");
 assert.equal(at("SE","2026-05-01T10:00:00Z").label,"노동절 휴장");
 assert.equal(iso(at("DE","2026-03-27T06:00:00Z")),"2026-03-27T08:00:00.000Z");
 assert.equal(iso(at("DE","2026-03-30T06:00:00Z")),"2026-03-30T07:00:00.000Z");
 assert.equal(iso(at("DE","2026-10-26T06:00:00Z")),"2026-10-26T08:00:00.000Z");
});
test("published half-days differ by exchange and pending year-end hours do not invent a close",()=>{
 assert.equal(at("GB","2026-12-24T12:30:00Z").label,"조기 마감");
 assert.equal(at("ES","2026-12-24T12:30:00Z").status,"open");
 assert.equal(at("ES","2026-12-24T13:00:00Z").label,"조기 마감");
 assert.equal(at("DE","2026-12-24T10:00:00Z").label,"크리스마스 이브 휴장");
 assert.equal(at("FR","2026-12-24T10:00:00Z").status,"unknown");
 assert.equal(iso(at("FR","2026-12-23T18:00:00Z")),null);
 assert.equal(at("SE","2026-04-30T11:00:00Z").label,"조기 마감");
 assert.equal(at("FI","2026-04-30T11:00:00Z").status,"open");
 assert.equal(at("NO","2026-04-01T11:00:00Z").label,"조기 마감");
});
test("Canada, Taiwan, Vietnam, Singapore and Australia retain local exceptions",()=>{
 assert.equal(at("CA","2026-11-26T15:00:00Z").status,"open");
 assert.equal(at("CA","2026-09-07T15:00:00Z").label,"노동절 휴장");
 assert.equal(at("TW","2026-02-12T02:00:00Z").label,"춘절 휴장");
 assert.equal(at("TW","2026-09-28T02:00:00Z").label,"스승의 날 휴장");
 assert.equal(at("VN","2026-08-31T03:00:00Z").label,"독립기념일 휴장");
 assert.equal(at("VN","2026-08-22T03:00:00Z").label,"주말 휴장");
 assert.equal(at("SG","2026-11-09T02:00:00Z").label,"디파발리 대체휴일 휴장");
 assert.equal(at("SG","2026-09-07T04:30:00Z").status,"break");
 assert.equal(at("AU","2026-12-24T14:10:00+11:00").label,"조기 마감");
 assert.equal(iso(at("AU","2026-10-02T08:00:00+10:00")),"2026-10-02T00:00:00.000Z");
 assert.equal(iso(at("AU","2026-10-05T08:00:00+11:00")),"2026-10-04T23:00:00.000Z");
});
test("all simultaneous exceptions survive grouping; differing reopening times cannot be merged",()=>{
 const {rankMarketSessions,groupSessionAlerts}=loadTypescript("src/features/market/schedule/index.ts");
 for(const date of ["2026-09-06T07:00:00Z","2026-04-03T07:00:00Z","2026-12-25T07:00:00Z","2027-01-04T12:00:00Z"]){
  const ranked=rankMarketSessions(calendars,Date.parse(date));
  const groups=groupSessionAlerts(ranked);
  assert.equal(groups.flat().map(i=>i.calendar.id).sort().join(","), ranked.filter(i=>i.alert).map(i=>i.calendar.id).sort().join(","));
  for(const group of groups) assert.ok(group.every(i=>i.alert.label===group[0].alert.label && i.alert.date===group[0].alert.date && i.state.nextAt===group[0].state.nextAt));
 }
 const groups=groupSessionAlerts(rankMarketSessions(calendars,Date.parse("2026-09-06T07:00:00Z")));
 assert.ok(groups.some(group=>group.map(i=>i.calendar.id).join(",")==="US,CA"));
 assert.equal(calendars.length,24);
 assert.equal(new Set(calendars.map(c=>c.id)).size,24);
 for(const c of calendars) assert.ok(c.sources.length>0 && c.windows.length>0 && c.region);
});
