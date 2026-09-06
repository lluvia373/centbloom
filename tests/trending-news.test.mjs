import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {loadTypescript} from "./load-typescript.mjs";
const {selectNewsSymbols,mergeTrendingNews}=loadTypescript("src/features/market/trending-news.ts");
const now=Date.parse("2026-09-06T12:00:00Z");
const story=(id,hours=1,symbols=["NVDA"],title=id)=>({id,url:"https://example.com/"+id,title,publisher:"Source",publishedAt:new Date(now-hours*3600000).toISOString(),symbols});
test("news targets take three from each live ranking and deduplicate stocks",()=>{
 const lists=[{quotes:["NVDA","PATH","INTC","NO"].map(symbol=>({symbol}))},{quotes:["NVDA","BLTE","AEHR","NO"].map(symbol=>({symbol}))}];
 assert.deepEqual(Array.from(selectNewsSymbols(lists)),["NVDA","PATH","INTC","BLTE","AEHR"]);
});
test("feed removes unrelated, stale and duplicate stories; direct company headlines lead within a fresh day",()=>{
 const direct=story("direct",2,["NVDA"],"Nvidia signs a new contract");
 const indirect=story("indirect",1,["NVDA"],"Another company changes its plan");
 const recent=story("recent",3,["NVDA"],"NVDA expands");
 const old=story("old",30,["NVDA"],"Nvidia yesterday");
 const result=mergeTrendingNews([[indirect,old,direct,recent,story("stale",73),story("future",-1),story("other",1,["OTHER"]),{...direct,id:"copy",url:"https://example.com/copy"}]],["NVDA"],now,{NVDA:"NVIDIA Corporation"});
 assert.deepEqual(Array.from(result,s=>s.id),["direct","recent","indirect","old"]);
});
test("stock news excludes search results whose provider ticker association does not match",async()=>{
 const {fetchNews}=loadTypescript("src/features/market/server/news.ts",{
  "./provider":{providerRequests:{request:(_key,load)=>load(new AbortController().signal)},yahoo:{search:async()=>({news:[
   {title:"Other",link:"https://example.com/other",publisher:"P",providerPublishTime:new Date(),relatedTickers:["OTHER"]},
   {title:"Match",link:"https://example.com/match",publisher:"P",providerPublishTime:new Date(),relatedTickers:["A","B","C","NVDA"]}
  ]})}}
 });
 const rows=await fetchNews("NVDA");assert.equal(rows.length,1);assert.equal(rows[0].symbols[0],"NVDA");
});
function feedLoader({allFail=false}={}) {
 const requested=[];
 const {fetchTrendingNews}=loadTypescript("src/features/market/server/trending-news.ts",{
  "./movers":{fetchMovers:async kind=>{if(kind==="losers")throw Error("offline");return {quotes:[{symbol:kind==="active"?"NVDA":"FAIL",name:"Nvidia"}]};}},
  "./news":{fetchNews:async symbol=>{requested.push(symbol);if(allFail||symbol==="FAIL")throw Error("offline");return [{...story("new"),publishedAt:new Date().toISOString()}];}},
  "./provider":{MarketError:class extends Error{}}
 });
 return {fetchTrendingNews,requested};
}
test("partial source failure keeps successful news with explicit partial state, all failure rejects",async()=>{
 const {fetchTrendingNews,requested}=feedLoader();const feed=await fetchTrendingNews();
 assert.equal(feed.partial,true);assert.equal(feed.stories.length,1);assert.equal(requested.length,2);
 await assert.rejects(feedLoader({allFail:true}).fetchTrendingNews(),/종목 뉴스를/);
});
test("news consumers share polling, preserve old articles on failure, and release hidden or unmounted work",async()=>{
 const {createPollingStore}=loadTypescript("src/shared/async/polling-store.ts");
 let calls=0,fail=false;
 const store=createPollingStore(async()=>{calls++;if(fail)throw Error("offline");return {stories:[story("kept")],partial:false}},10);
 const stop1=store.subscribe("trending",()=>{}),stop2=store.subscribe("trending",()=>{});
 try {
  await new Promise(r=>setTimeout(r,0));assert.equal(calls,1);stop1();
  fail=true;await store.refresh("trending");assert.equal(store.snapshot("trending").failed,true);assert.equal(store.snapshot("trending").data.stories[0].id,"kept");
  store.setVisible(false);const hidden=calls;await new Promise(r=>setTimeout(r,30));assert.equal(calls,hidden);
  fail=false;store.setVisible(true);await new Promise(r=>setTimeout(r,0));assert.equal(store.snapshot("trending").failed,false);
  stop2();const stopped=calls;await new Promise(r=>setTimeout(r,30));assert.equal(calls,stopped);
 } finally {stop1();stop2();}
});
test("news heading removes provider banner and descriptive slogans but preserves article source and stale warning",()=>{
 const {MarketNews}=loadTypescript("src/features/home/MarketNews.tsx",{
  "@/features/market/use-market-news":{useMarketNews:()=>({stories:[story("Headline")],loading:false,error:true,partial:false,retry:()=>{}})},
  "./home.module.css":{default:new Proxy({},{get:(_,key)=>String(key)})}
 });
 const html=renderToStaticMarkup(React.createElement(MarketNews));
 assert.doesNotMatch(html,/newsNumber|>01</);assert.match(html,/>종목 뉴스</);assert.match(html,/Source/);assert.match(html,/갱신 실패/);assert.match(html,/Headline/);
 assert.doesNotMatch(html,/Yahoo Finance|영문 원문|미국 시장 · 기업 이슈|주요 소식과 시장 이슈/);
});
