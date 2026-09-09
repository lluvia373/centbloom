import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {loadTypescript} from "./load-typescript.mjs";
const styles={default:new Proxy({}, {get:(_,key)=>String(key)})};
const rows=Array.from({length:10},(_,i)=>({symbol:"TEST"+i,name:"Company "+i,price:100,currency:"USD",volume:100,changePercent:1,quotedAt:"2026-09-06T00:00:00Z"}));
function renderTable({expanded=false,data={quotes:rows},failed=false}={}){
 data=data?{kind:"active",fetchedAt:"2026-09-08T12:00:00Z",rankChanges:{},...data}:null;
 const {MoverTable}=loadTypescript("src/features/home/MoverTable.tsx",{
  react:{...React,useState:()=>[expanded,()=>{}]},
  "./home.module.css":styles,
  "@/components/AssetAvatar":{AssetAvatar:()=>null},
  "@/features/market/use-market-movers":{useMarketMovers:()=>({data,failed,loading:false,refresh:()=>{}})},
 });
 return renderToStaticMarkup(React.createElement(MoverTable,{kind:"active"}));
}
test("rankings show five rows initially and ten when expanded, with an accessible control",()=>{
 const collapsed=renderTable();assert.equal((collapsed.match(/<li>/g)||[]).length,5);assert.match(collapsed,/aria-expanded="false"/);assert.match(collapsed,/<h3><button[^>]*aria-expanded="false"/);assert.doesNotMatch(collapsed,/더 보기/);assert.doesNotMatch(collapsed,/TEST5/);
 const expanded=renderTable({expanded:true});assert.equal((expanded.match(/<li>/g)||[]).length,10);assert.match(expanded,/aria-expanded="true"/);assert.doesNotMatch(expanded,/더 보기|접기/);
 assert.doesNotMatch(collapsed.replace(/<[^>]*>/g,""),/TOP 10|조회/);assert.match(collapsed,/정규장 기준 · 지연 가능/);
});
test("short and failed lists retain honest states and no unnecessary expand control",()=>{
 const html=renderTable({data:{quotes:rows.slice(0,3)},failed:true});assert.doesNotMatch(html,/더 보기/);assert.match(html,/갱신 실패 · 이전 목록 표시 중/);assert.match(html,/다시 시도/);
 const empty=renderTable({data:null,failed:true});assert.match(empty,/종목을 가져오지 못/);assert.doesNotMatch(empty,/더 보기/);
});
test("market ranking presents volume first and removes redundant heading copy",()=>{
 const {MarketMovers}=loadTypescript("src/features/home/MarketMovers.tsx",{"./home.module.css":styles,"./DiscoveryShortcuts":{DiscoveryShortcuts:()=>null},"./MoverTable":{MoverTable:({kind})=>React.createElement("p",null,kind)}});
 const html=renderToStaticMarkup(React.createElement(MarketMovers));assert.ok(html.indexOf(">active<")<html.indexOf(">gainers<"));assert.match(html,/종목 순위/);assert.doesNotMatch(html,/지금 움직이는|한국 · 해외|미국 주식|순위 기준/);
});

test("rank movement remains accessible without displaying internal refresh metadata",()=>{
 const html=renderTable({data:{quotes:rows,rankChanges:{TEST0:3,TEST1:-2,TEST2:"new",TEST3:0,TEST4:null}}});
 assert.match(html,/▲3/);assert.match(html,/▼2/);assert.match(html,/신규/);
 assert.match(html,/aria-label="직전 조회 대비 3계단 상승"/);
 assert.match(html,/aria-label="직전 조회 대비 2계단 하락"/);
 assert.match(html,/lucide-flame/);
 assert.doesNotMatch(html,/<time|2026-09-08T12:00:00Z|마지막 확인|30초|갱신 주기/);
});
