import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {loadTypescript} from "./load-typescript.mjs";
const {marketEvents}=loadTypescript("src/features/calendar/data.ts");
const {eventsInMonth,groupEvents,kstDate,validMonth,shiftMonth}=loadTypescript("src/features/calendar/model.ts");
const {weekDays,shiftDay,validDay,filterEvents,onDay,safeReturn,eventHref}=loadTypescript("src/features/calendar/navigation.ts");
const {scheduleRelease}=loadTypescript("src/features/calendar/release.ts");
const {calendarQuery}=loadTypescript("src/features/calendar/server/query.ts");
const styles={default:new Proxy({},{get:(_,key)=>String(key)})};
test("week selection crosses month/year boundaries, starts Monday and keeps all simultaneous KST releases",()=>{
 assert.deepEqual(Array.from(weekDays("2026-01-01")),["2025-12-29","2025-12-30","2025-12-31","2026-01-01","2026-01-02","2026-01-03","2026-01-04"]);
 assert.equal(shiftDay("2024-02-28",1),"2024-02-29");
 assert.equal(validDay("2026-02-30"),false);
 const releases=marketEvents.map(scheduleRelease);
 assert.equal(onDay(releases,"2026-09-16").length,3);
 assert.equal(kstDate(marketEvents.find(e=>e.id==="fomc-09").at),"2026-09-17");
 assert.equal(groupEvents(marketEvents).find(g=>g.day==="2026-09-30").events.length,3);
});
test("calendar month selection preserves data and excludes invalid/unregistered months",()=>{
 assert.equal(eventsInMonth(marketEvents,"2026-09").length,17);
 assert.equal(eventsInMonth(marketEvents,"2026-10").length,8);
 assert.equal(eventsInMonth(marketEvents,"2027-01").length,0);
 assert.equal(validMonth("2026-13"),false);
 assert.equal(shiftMonth("2026-12",1),"2027-01");
 assert.equal(new Set(marketEvents.map(e=>e.id)).size,marketEvents.length);
});
test("category filters keep legacy economic records separate from earnings, return links reject external URLs",()=>{
 const economic=scheduleRelease(marketEvents[0]);delete economic.kind;
 const earnings={...economic,id:"earnings:1",kind:"earnings"};
 assert.equal(filterEvents([economic,earnings],"economic")[0].id,economic.id);
 assert.equal(filterEvents([economic,earnings],"earnings")[0].id,earnings.id);
 assert.equal(filterEvents([economic,earnings],"all").length,2);
 for(const bad of ["https://evil.test","//evil.test","/portfolio","/calendar/evil","/\\evil.test"]) assert.equal(safeReturn(bad),"/calendar");
 assert.equal(safeReturn("/?calendarDay=2026-09-16"),"/?calendarDay=2026-09-16");
 assert.match(eventHref(earnings,"/calendar?day=2026-09-16"),/^\/calendar\/earnings%3A1\?from=/);
});
test("week API boundaries use KST, reject multiple query types and expose single events",async()=>{
 const q=calendarQuery(new URLSearchParams("week=2026-09-14"));
 assert.equal(q.from,"2026-09-13T15:00:00.000Z");
 assert.equal(q.to,"2026-09-20T15:00:00.000Z");
 for(const params of ["week=2026-02-30","month=2026-13","month=2026-09&event=cpi-09","event="]) assert.equal(calendarQuery(new URLSearchParams(params)),null);
 const {NextRequest}=await import("next/server.js");
 const {GET}=loadTypescript("src/app/api/calendar/route.ts",{"@/features/calendar/server/repository":{archiveEnabled:()=>false}});
 const weekly=await (await GET(new NextRequest("http://localhost/api/calendar?week=2026-09-14"))).json();
 assert.equal(weekly.events.length,6);assert.equal(weekly.connected,false);assert.equal(weekly.earningsConnected,false);
 const single=await (await GET(new NextRequest("http://localhost/api/calendar?event=cpi-09"))).json();
 assert.equal(single.events[0].id,"cpi-09");
 assert.equal((await GET(new NextRequest("http://localhost/api/calendar?week=wrong"))).status,400);
});
test("home renders seven dates, all selected-day events and same-tab detail links without modal",()=>{
 const params=new URLSearchParams("calendarDay=2026-09-16");
 const {WeekCalendar}=loadTypescript("src/features/calendar/WeekCalendar.tsx",{
  "./use-calendar-selection":{useCalendarSelection:()=>({params,update:()=>{}})},
  "./use-calendar-feed":{useCalendarFeed:()=>({})},"./calendar.module.css":styles
 });
 const html=renderToStaticMarkup(React.createElement(WeekCalendar,{now:Date.parse("2026-09-16T00:00:00Z")}));
 assert.match(html,/이번 주 일정/);assert.match(html,/KST/);
 assert.equal((html.match(/aria-pressed=/g)||[]).length,7);
 assert.equal((html.match(/<li>/g)||[]).length,3);
 assert.match(html,/href="\/calendar\/retail-09\?/);
 assert.match(html,/calendarDay%3D2026-09-16/);
 assert.doesNotMatch(html,/<dialog|target="_blank"|중요/);
});
test("calendar details are public while unrelated nested/private paths remain protected",()=>{
 const {isPublicRoute}=loadTypescript("src/features/auth/public-routes.ts");
 assert.equal(isPublicRoute("/calendar"),true);
 assert.equal(isPublicRoute("/calendar/cpi-09"),true);
 assert.equal(isPublicRoute("/calendar/cpi-09/edit"),false);
 assert.equal(isPublicRoute("/portfolio"),false);
});
