import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTypescript } from "./load-typescript.mjs";
const {createRecentSearches, parseRecentSearches} = loadTypescript("src/features/market/recent-searches.ts");
const stock = (symbol) => ({symbol,name:"Company "+symbol});
function fixture() {
  const data=new Map();
  const store=createRecentSearches(()=>({getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)}));
  return {data,store};
}
test("recent selections persist, deduplicate case-insensitively, and retain six newest stocks",()=>{
 const {store,data}=fixture();
 for(let i=0;i<9;i++) assert.equal(store.record("a",stock("S"+i)),true);
 store.record("a",stock("s5"));
 assert.deepEqual(Array.from(parseRecentSearches(store.read("a")),x=>x.symbol),["S5","S8","S7","S6","S4","S3"]);
 const reopened=createRecentSearches(()=>({getItem:key=>data.get(key),setItem:()=>{}}));
 assert.equal(parseRecentSearches(reopened.read("a"))[0].symbol,"S5");
});
test("guest and account changes never expose or write another account's recent searches",()=>{
 const {store,data}=fixture();
 store.record("a",stock("AAPL"));store.record("b",stock("NVDA"));
 assert.equal(store.read(null),null);assert.equal(store.record(null,stock("TSLA")),false);
 assert.equal(parseRecentSearches(store.read("a"))[0].symbol,"AAPL");
 assert.equal(parseRecentSearches(store.read("b"))[0].symbol,"NVDA");assert.equal(data.size,2);
});
test("storage denial and malformed records do not break search or destroy the stored original",()=>{
 const {store,data}=fixture();store.record("a",stock("AAPL"));
 const key=[...data.keys()][0]; data.set(key,"{broken");
 assert.equal(parseRecentSearches(store.read("a")).length,0);
 assert.equal(store.record("a",stock("NVDA")),false);assert.equal(data.get(key),"{broken");
 const denied=createRecentSearches(()=>{throw new Error("denied")});
 assert.equal(denied.read("a"),null);assert.equal(denied.record("a",stock("AAPL")),false);
 const quota=createRecentSearches(()=>({getItem:()=>null,setItem:()=>{throw new Error("quota")}}));
 assert.equal(quota.record("a",stock("AAPL")),false);
 assert.equal(store.record("a",stock("<script>")),false);
});
function shortcuts(userId, {loading=false}={}) {
 const {DiscoveryShortcuts}=loadTypescript("src/features/home/DiscoveryShortcuts.tsx",{
  "@/hooks/useAuth":{useAuth:()=>({user:userId?{id:userId}:null,loading})},
  "@/features/market/use-recent-searches":{useRecentSearches:id=>({stocks:id==="a"?[stock("RECENT_A")]:[]})},
  "@/features/market/use-market-movers":{useMarketMovers:()=>{throw new Error("Shortcuts must not subscribe to rankings");}},
  "./home.module.css":{default:new Proxy({},{get:(_,key)=>String(key)})}
 });
 return renderToStaticMarkup(React.createElement(DiscoveryShortcuts));
}
test("ranking shortcuts are removed; only the signed-in account recent searches remain",()=>{
 assert.equal(shortcuts(null),"");
 assert.equal(shortcuts("b"),"");
 assert.equal(shortcuts("a",{loading:true}),"");
 const own=shortcuts("a");assert.match(own,/최근 검색/);assert.match(own,/RECENT_A/);
 assert.doesNotMatch(own,/거래량 상위|상승 종목|ACTIVE|GAINER/);
});

test("existing Centifolio searches survive the first Centbloom selection",()=>{
 const {store,data}=fixture();const original=JSON.stringify([stock("AAPL")]);
 data.set("centifolio:recent-searches:v1:a",original);
 assert.equal(parseRecentSearches(store.read("a"))[0].symbol,"AAPL");
 assert.equal(store.record("a",stock("NVDA")),true);
 assert.deepEqual(Array.from(parseRecentSearches(store.read("a")),s=>s.symbol),["NVDA","AAPL"]);
 assert.equal(data.get("centifolio:recent-searches:v1:a"),original);assert.equal(store.read("b"),null);
});
