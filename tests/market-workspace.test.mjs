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

const { compareMoverRanks, describeRankChange } = loadTypescript("src/features/market/mover-ranks.ts");
const rankResult = (symbols, seconds, kind = "gainers") => ({
  kind, quotes: symbols.map(symbol => ({ symbol })), total: 100,
  fetchedAt: new Date(Date.UTC(2026, 8, 8, 14, 30, seconds)).toISOString(),
});

test("rank changes use the full prior list and distinguish first load, moves, unchanged and entrants", () => {
  const first = compareMoverRanks(rankResult(["A", "B", "C", "D", "E", "F"], 0));
  assert.equal(first.rankChanges.A, null);
  assert.equal(first.comparedAt, undefined);
  const next = compareMoverRanks(rankResult(["C", "B", "F", "A", "NEW", "E"], 30), first);
  assert.deepEqual({ ...next.rankChanges }, { C: 2, B: 0, F: 3, A: -3, NEW: "new", E: -1 });
  assert.equal(next.comparedAt, first.fetchedAt);
  assert.equal(first.quotes[0].symbol, "A");
  assert.equal(describeRankChange(-3), "직전 조회 대비 3계단 하락");
});

test("duplicate or older responses preserve deltas; fresh equal ranks clear them", () => {
  const first = compareMoverRanks(rankResult(["A", "B"], 0));
  const moved = compareMoverRanks(rankResult(["B", "A"], 30), first);
  assert.equal(compareMoverRanks(rankResult(["B", "A"], 30), moved), moved);
  assert.equal(compareMoverRanks(rankResult(["A", "B"], 10), moved), moved);
  const unchanged = compareMoverRanks(rankResult(["B", "A"], 60), moved);
  assert.equal(unchanged.rankChanges.B, 0);
  assert.equal(unchanged.rankChanges.A, 0);
});

test("different list kinds and empty baselines cannot invent rank moves", () => {
  const gainers = compareMoverRanks(rankResult(["A", "B"], 0));
  const losers = compareMoverRanks(rankResult(["B", "A"], 30, "losers"), gainers);
  assert.equal(losers.rankChanges.B, null);
  const empty = compareMoverRanks(rankResult([], 30), gainers);
  assert.equal(compareMoverRanks(rankResult(["A"], 60), empty).rankChanges.A, null);
  const nextLosers = compareMoverRanks(rankResult(["A", "B"], 60, "losers"), losers);
  assert.equal(nextLosers.rankChanges.A, 1);
  assert.equal(nextLosers.rankChanges.B, -1);
  assert.throws(() => compareMoverRanks({ ...rankResult(["A"], 60), fetchedAt: "bad" }));
});

test("failed refresh retains comparison history; recovery uses last success and unmount resets it", async () => {
  let response = rankResult(["A", "B", "C"], 0);
  let fail = false;
  const store = createMoversStore(async () => { if (fail) throw Error("offline"); return response; });
  let stop = store.subscribe("gainers", () => {});
  try {
    await tick();
    response = rankResult(["B", "A", "C"], 30);
    await store.refresh("gainers");
    const good = store.snapshot("gainers").data;
    fail = true; await store.refresh("gainers");
    assert.equal(store.snapshot("gainers").failed, true);
    assert.equal(store.snapshot("gainers").data, good);
    fail = false; response = rankResult(["C", "B", "A"], 90);
    await store.refresh("gainers");
    assert.equal(store.snapshot("gainers").failed, false);
    assert.deepEqual({ ...store.snapshot("gainers").data.rankChanges }, { C: 2, B: -1, A: -1 });
    response = rankResult(["A"], 100, "losers");
    await store.refresh("gainers");
    assert.equal(store.snapshot("gainers").failed, true);
    assert.equal(store.snapshot("gainers").data.quotes[0].symbol, "C");
    stop(); response = rankResult(["A", "C"], 120);
    stop = store.subscribe("gainers", () => {}); await tick();
    assert.equal(store.snapshot("gainers").data.rankChanges.A, null);
  } finally { stop(); }
});

test("server screening shares a short cache below the polling interval", async () => {
  const { MOVERS_REFRESH_MS, MOVERS_CACHE_MS } = loadTypescript("src/features/market/movers-model.ts");
  const options = []; const screens = [];
  const { fetchMovers } = loadTypescript("src/features/market/server/movers.ts", {
    "./provider": {
      providerRequests: { request: async (key, load, config) => { options.push({ key, ...config }); return load(new AbortController().signal); } },
      yahoo: { screener: async ({ scrIds }) => { screens.push(scrIds); return { quotes: [quote("A", scrIds === "day_losers" ? -5 : 5)], total: 1 }; } },
      MarketError: Error,
    },
  });
  for (const kind of ["active", "gainers", "losers"]) await fetchMovers(kind);
  assert.equal(MOVERS_REFRESH_MS, 30_000);
  assert.ok(MOVERS_CACHE_MS < MOVERS_REFRESH_MS / 2);
  assert.ok(options.every(option => option.ttlMs === MOVERS_CACHE_MS));
  assert.deepEqual(screens, ["most_actives", "day_gainers", "day_losers"]);
});
