import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {loadTypescript} from "./load-typescript.mjs";
const styles={default:new Proxy({}, {get:(_,key)=>String(key)})};
const rows=Array.from({length:10},(_,i)=>({symbol:"TEST"+i,name:"Company "+i,price:100,currency:"USD",volume:100,changePercent:1,quotedAt:"2026-09-06T00:00:00Z"}));
function renderTable({kind="active",full=false,data={quotes:rows},failed=false}={}){
 data=data?{kind,fetchedAt:"2026-09-08T12:00:00Z",rankChanges:{},...data}:null;
 const {MoverTable}=loadTypescript("src/features/home/MoverTable.tsx",{
  "./home.module.css":styles,
  "@/components/AssetAvatar":{AssetAvatar:()=>null},
  "@/features/watchlist/WatchStockButton":{WatchStockButton:({symbol})=>React.createElement("button",{"aria-label":symbol+" 관심종목에 담기"},"☆")},
  "@/features/market/use-market-movers":{useMarketMovers:()=>({data,failed,loading:false,refresh:()=>{}})},
 });
 return renderToStaticMarkup(React.createElement(MoverTable,{kind,full}));
}
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

const rankingCases = [
 ["active", "volume", "거래량 상위"],
 ["gainers", "gainers", "상승 종목"],
 ["losers", "losers", "하락 종목"],
];
for (const [kind, route, title] of rankingCases) {
 test(kind+" preview links to its full ranking even while loading, short or failed",()=>{
  const preview=renderTable({kind});
  assert.equal((preview.match(/<li>/g)||[]).length,5);
  assert.match(preview,new RegExp('<h3><a[^>]*href="/rankings/'+route+'"'));
  assert.doesNotMatch(preview,/aria-expanded|aria-controls|TEST5|더 보기/);
  assert.doesNotMatch(preview.replace(/<[^>]*>/g,""),/TOP 10|조회/);
  assert.match(preview,/정규장 기준 · 지연 가능/);
  const full=renderTable({kind,full:true});
  assert.equal((full.match(/<li>/g)||[]).length,10);
  assert.doesNotMatch(full,/aria-expanded|<h3/);
  assert.ok(!full.includes('href="/rankings/'+route+'"'));
  for (const state of [{data:null},{data:null,failed:true},{data:{quotes:rows.slice(0,3)}}]) {
   const html=renderTable({kind,...state});
   assert.ok(html.includes('href="/rankings/'+route+'"'));
   if(state.failed) assert.match(html,/다시 시도/);
  }
 });
 test(route+" page shows the matching full ranking, followed by major news, with a home link",async()=>{
  const {default:Page,metadata}=loadTypescript("src/app/rankings/"+route+"/page.tsx",{
   "@/features/market/server/news-response":{initialNews:async()=>null},
   "./home.module.css":styles,
   "./MoverTable":{MoverTable:({kind,full})=>React.createElement("p",null,kind+":"+full)},
   "./MarketNews":{MarketNews:()=>React.createElement("h2",null,"주요뉴스")},
  });
  const element=Page();
  const html=renderToStaticMarkup(await element.type(element.props));
  assert.ok(html.includes("<h1>"+title+"</h1>"));
  assert.ok(html.includes('href="/"'));
  assert.ok(html.includes(kind+":true"));
  assert.ok(html.indexOf(kind+":true")<html.indexOf("주요뉴스"));
  assert.equal(metadata.title,title+" | Centbloom");
 });
}
