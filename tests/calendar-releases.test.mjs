import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {loadTypescript} from "./load-typescript.mjs";
const {normalizeReleases}=loadTypescript("src/features/calendar/server/provider.ts");
const {releaseStatus,displayValue}=loadTypescript("src/features/calendar/release.ts");
const {monthCells}=loadTypescript("src/features/calendar/month-grid.ts");
const sample=(overrides={})=>({CalendarId:"1",Date:"2026-09-16T18:00:00",LastUpdate:"2026-09-16T18:00:05",Country:"United States",Event:"Interest Rate Decision",Reference:"SEP",Symbol:"FDTR",Actual:"0",Forecast:"0.25%",TEForecast:"0.5%",Previous:"0.25%",Revised:"0.5%",Unit:"%",Source:"Federal Reserve",SourceURL:"https://federalreserve.gov",DateSpan:0,...overrides});
test("completed requires a received actual value, including zero; elapsed clock never invents completion",()=>{
 const event=normalizeReleases([sample()])[0];
 assert.equal(releaseStatus(event,0),"발표 완료");
 assert.equal(event.at,"2026-09-16T18:00:00.000Z");
 assert.equal(event.forecast,"0.25%");
 assert.equal(displayValue(event.actual,event.unit),"0 %");
 const pending=normalizeReleases([sample({Actual:"",DateSpan:1})])[0];
 assert.equal(releaseStatus(pending,Date.parse("2026-09-17")),"결과 대기");
 assert.equal(releaseStatus(pending,0),"발표 예정");
 assert.equal(pending.timingEstimated,true);
 assert.equal(displayValue(null), "—");
});
test("provider identity and timestamp errors reject whole batch, consensus never falls back to vendor prediction",()=>{
 const event=normalizeReleases([sample({Forecast:null,Actual:"N/A",SourceURL:"javascript:alert(1)"})])[0];
 assert.equal(event.forecast,null);assert.equal(event.actual,null);assert.equal(event.source.url,"");
 assert.throws(()=>normalizeReleases([sample(),sample({Symbol:null})]),/identity/);
 assert.throws(()=>normalizeReleases([sample({LastUpdate:"invalid"})]),/timestamp/);
 assert.notEqual(normalizeReleases([sample({Symbol:"CPIYOY"}),sample({CalendarId:"2",Symbol:"CPIMOM"})])[0].seriesKey,normalizeReleases([sample({Symbol:"CPIMOM"})])[0].seriesKey);
});
test("calendar draws correct Sunday-first month cells including leap and six-week months",()=>{
 assert.equal(monthCells("2026-09").length,35);
 assert.equal(monthCells("2026-09")[2],"2026-09-01");
 assert.equal(monthCells("2024-02").filter(Boolean).length,29);
 assert.equal(monthCells("2026-08").length,42);
 assert.equal(monthCells("2026-13").length,0);
});
test("release detail shows actual, consensus, previous and stored historical results without importance",()=>{
 const event=normalizeReleases([sample()])[0];
 const {ReleaseDetails}=loadTypescript("src/features/calendar/ReleaseDetails.tsx",{
  "./use-calendar-feed":{useCalendarFeed:()=>({data:{connected:true,events:[event]},failed:false})},
  "./calendar.module.css":{default:new Proxy({},{get:(_,key)=>String(key)})}
 });
 const html=renderToStaticMarkup(React.createElement(ReleaseDetails,{event,now:Date.now(),from:"/calendar"}));
 assert.match(html,/발표 완료/);assert.match(html,/실제치/);assert.match(html,/예상치/);assert.match(html,/이전치/);assert.match(html,/발표 이력/);assert.match(html,/0 %/);assert.doesNotMatch(html,/중요/);
});

test("earnings separates EPS and revenue, distinguishes partial results, and charts never turn missing/incompatible values into zero",()=>{
 const {releaseStatus,releaseMetrics,trendPoints}=loadTypescript("src/features/calendar/release.ts");
 const base=normalizeReleases([sample()])[0];
 const event={...base,kind:"earnings",seriesKey:"earnings:TEST",earnings:{symbol:"TEST",currency:"USD",eps:{actual:"0",forecast:"1",previous:"2"},revenue:{actual:null,forecast:"100",previous:"90"}}};
 assert.equal(releaseStatus(event,Date.now()),"일부 결과 수신");
 event.earnings.revenue.actual="0";
 assert.equal(releaseStatus(event,Date.now()),"발표 완료");
 assert.equal(releaseMetrics(event).length,2);
 const missing={...event,id:"old",at:"2026-08-01T00:00:00Z",earnings:{...event.earnings,eps:{actual:null,forecast:"0.5",previous:null}}};
 const different={...event,id:"eur",at:"2026-07-01T00:00:00Z",earnings:{...event.earnings,currency:"EUR"}};
 const points=trendPoints([event,missing,different],event,"eps");
 assert.equal(points[0].actual,null);assert.equal(points[0].forecast,null);
 assert.equal(points[1].actual,null);assert.equal(points[1].forecast,0.5);
 assert.equal(points[2].actual,0);
});
