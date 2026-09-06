import test from "node:test";
import assert from "node:assert/strict";
import {loadTypescript} from "./load-typescript.mjs";
const {normalizeMovers}=loadTypescript("src/features/market/movers-model.ts");
const {createMoversStore}=loadTypescript("src/features/market/movers-store.ts");
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const quote=(symbol,percent=5)=>({symbol,region:"US",quoteType:"EQUITY",currency:"USD",regularMarketPrice:20,regularMarketChange:1,regularMarketChangePercent:percent,regularMarketVolume:50,regularMarketTime:1788552000});
const result=(symbol)=>({kind:"gainers",quotes:[{symbol}],fetchedAt:"2026-09-06T00:00:00Z",total:1});

test("screening rejects missing prices, timestamps, wrong direction, region and duplicates",()=>{
 const rows=[quote("A"),quote("A"),quote("B",-5),{...quote("C"),currency:"KRW"},{...quote("D"),region:"KR"},{...quote("E"),regularMarketChangePercent:NaN},{...quote("F"),regularMarketTime:undefined},{...quote("G"),regularMarketPrice:0},{...quote("H"),quoteType:"ETF"}];
 assert.deepEqual(Array.from(normalizeMovers(rows,"gainers"),q=>q.symbol),["A"]);
 assert.deepEqual(Array.from(normalizeMovers(rows,"losers"),q=>q.symbol),["B"]);
 assert.equal(normalizeMovers([{...quote("A"),regularMarketVolume:undefined}],"active").length,0);
 assert.equal(rows.length,9);
});
test("screening keeps ten correctly sorted real results, numeric seconds become quote time",()=>{
 const rows=Array.from({length:20},(_,i)=>quote("S"+i,i+1));
 const sorted=normalizeMovers(rows,"gainers");
 assert.equal(sorted.length,10);
 assert.equal(sorted[0].symbol,"S19");
 assert.equal(sorted[9].symbol,"S10");
 assert.equal(sorted[0].quotedAt,new Date(1788552000*1000).toISOString());
 assert.equal(rows[0].symbol,"S0");
});
test("multiple consumers share in-flight list; one unsubscribe cannot cancel another",async()=>{
 let resolve,signal,calls=0;
 const store=createMoversStore((_k,s)=>{signal=s;calls++;return new Promise(r=>resolve=r);});
 const stop1=store.subscribe("gainers",()=>{});
 const stop2=store.subscribe("gainers",()=>{});
 try {assert.equal(calls,1);stop1();assert.equal(signal.aborted,false);resolve(result("A"));await tick();assert.equal(store.snapshot("gainers").data.quotes[0].symbol,"A");}
 finally {stop2();}
 assert.equal(store.snapshot("gainers"),store.empty);
});
test("removed list's late result cannot overwrite a newly subscribed list",async()=>{
 const pending=[];
 const store=createMoversStore((_k,signal)=>new Promise(resolve=>pending.push({resolve,signal})));
 const stop1=store.subscribe("gainers",()=>{});stop1();
 const stop2=store.subscribe("gainers",()=>{});
 try {assert.equal(pending[0].signal.aborted,true);pending[1].resolve(result("NEW"));await tick();pending[0].resolve(result("OLD"));await tick();assert.equal(store.snapshot("gainers").data.quotes[0].symbol,"NEW");}
 finally {stop2();}
});
test("failed refresh preserves last successful list and explicit retry recovers",async()=>{
 let fail=false;
 const store=createMoversStore(async()=>{if(fail)throw Error("offline");return result(fail?"B":"A");});
 const stop=store.subscribe("gainers",()=>{});
 try {await tick();fail=true;await store.refresh("gainers");assert.equal(store.snapshot("gainers").failed,true);assert.equal(store.snapshot("gainers").data.quotes[0].symbol,"A");fail=false;await store.refresh("gainers");assert.equal(store.snapshot("gainers").failed,false);}
 finally {stop();}
});
test("polling pauses while hidden and releases work with last consumer",async()=>{
 let calls=0;
 const store=createMoversStore(async()=>{calls++;return result("A");},20);
 const stop=store.subscribe("gainers",()=>{});
 try {await tick();store.setVisible(false);const before=calls;await new Promise(r=>setTimeout(r,55));assert.equal(calls,before);store.setVisible(true);await tick();assert.ok(calls>before);stop();const stopped=calls;await new Promise(r=>setTimeout(r,55));assert.equal(calls,stopped);}
 finally {stop();}
});
test("public market news retains more than the former six-story limit",()=>{
 const {normalizeNews}=loadTypescript("src/features/market/news-model.ts");
 const now=Date.parse("2026-09-06T00:00:00Z");
 const rows=Array.from({length:18},(_,i)=>({title:"News "+i,publisher:"Publisher",link:"https://example.com/"+i,providerPublishTime:new Date(now-i*1000)}));
 assert.equal(normalizeNews(rows,now).length,18);
});
