import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTypescript} from './load-typescript.mjs';

function harness(t,fetcher) {
 const original=globalThis.fetch;globalThis.fetch=fetcher;t.after(()=>{globalThis.fetch=original;});
 const {createRequestCache}=loadTypescript('src/shared/async/request-cache.ts');
 return loadTypescript('src/lib/stock-api.ts',{
  '@/shared/async/request-cache':{createRequestCache:()=>{
   const cache=createRequestCache();
   return {...cache,request:(key,loader,options)=>cache.request(key,loader,{
    ...options,timeoutMs:30,retry:options.retry?{...options.retry,delayMs:1}:undefined,
   })};
  }},
 });
}
const series={points:[{date:'2020-01-01',close:100}]};

test('one 503 history request retries without refetching successful positions or saving incomplete performance',async(t)=>{
 const calls=new Map();let saved=0,calculated=0;
 const api=harness(t,async url=>{
  const symbol=new URL(url,'http://localhost').pathname.split('/').at(-1);
  calls.set(symbol,(calls.get(symbol)??0)+1);
  if(symbol==='GOOGL'&&calls.get(symbol)===1)return new Response('Service unavailable',{status:503});
  return Response.json({...series,symbol});
 });
 const {buildDailyPerformance}=loadTypescript('src/lib/performance.ts');
 const createdAt='2020-01-01T00:00:00Z';
 const transactions=['AAPL','GOOGL','QA'].map(symbol=>({id:symbol,symbol,name:symbol,type:'buy',date:'2020-01-01',createdAt,price:100,quantity:1,fee:0,currency:'KRW',fxRateToKRW:1,usdKrwRateAtTransaction:1300}));
 const {loadPerformance}=loadTypescript('src/features/performance/service.ts',{
  '@/lib/stock-api':api,
  './repository':{readHistory:async()=>({saved:null,startedAt:createdAt}),saveHistory:async()=>{saved++;return null;}},
  './calculate':{calculateHistory:async input=>{calculated++;assert.equal(Object.keys(input.pricesBySymbol).length,3);return buildDailyPerformance(input);}},
 });
 const result=await loadPerformance({userId:null,revision:'r1',transactions,today:'2020-01-03'},new AbortController().signal);
 assert.equal(calls.get('GOOGL'),2);assert.equal(calls.get('AAPL'),1);assert.equal(calls.get('QA'),1);
 assert.equal(result.points.at(-1).assetValueKRW,300);assert.equal(saved,1);assert.equal(calculated,1);
});

test('persistent 503 remains a named failure and does not fabricate chart data',async(t)=>{
 let calls=0;const api=harness(t,async()=>{calls++;return new Response('busy',{status:503});});
 await assert.rejects(api.getChartSeries('GOOGL','2020-01-01','2020-01-03'),e=>e.cause===503&&/GOOGL.*HTTP 503/.test(e.message));
 assert.equal(calls,2);
});

test('404 and invalid successful payloads are not retried; 404 status survives for the extended lookback',async(t)=>{
 let calls=0,invalid=false;
 const api=harness(t,async()=>{calls++;return invalid?Response.json({points:[]}):Response.json({error:'no history'},{status:404});});
 await assert.rejects(api.getChartSeries('MISSING','2020-01-01','2020-01-03'),e=>e.cause===404);
 assert.equal(calls,1);invalid=true;
 await assert.rejects(api.getChartSeries('INVALID','2020-01-01','2020-01-03'),/유효한 차트 가격/);assert.equal(calls,2);
});

test('network failure and a hung response retry once and return only complete validated data',async(t)=>{
 const calls=new Map();
 const api=harness(t,async url=>{
  const symbol=new URL(url,'http://localhost').pathname.split('/').at(-1);calls.set(symbol,(calls.get(symbol)??0)+1);
  if(calls.get(symbol)===1){if(symbol==='NETWORK')throw new TypeError('fetch failed');return new Promise(()=>{});}
  return Response.json(series);
 });
 const results=await Promise.all(['NETWORK','TIMEOUT'].map(symbol=>api.getChartSeries(symbol,'2020-01-01','2020-01-03')));
 assert.ok(results.every(result=>result.points[0].close===100));assert.deepEqual([...calls.values()],[2,2]);
});

test('current FX and historical FX transient failures use the same bounded retry',async(t)=>{
 const calls=new Map();
 const api=harness(t,async url=>{
  const path=new URL(url,'http://localhost').pathname;calls.set(path,(calls.get(path)??0)+1);
  if(calls.get(path)===1)return new Response('busy',{status:503});
  return Response.json(path.includes('quote')?{symbol:'USDKRW=X',currency:'KRW',price:1300}:{
   currency:'USD',baseCurrency:'KRW',method:'daily-reference',source:'ecb-reference',
   points:[{date:'2020-01-02',close:1300,referenceDate:'2020-01-02',carried:false,source:'ecb-reference'}],
  });
 });
 assert.equal((await api.getQuote('USDKRW=X')).price,1300);
 assert.equal((await api.getDailyFxHistory('USD','2020-01-02','2020-01-02')).points[0].close,1300);
 assert.deepEqual([...calls.values()],[2,2]);
});

test('interrupted successful response bodies retry but invalid JSON does not',async(t)=>{
 let calls=0,invalid=false;
 const api=harness(t,async()=>{
  calls++;
  if(invalid)return {ok:true,json:async()=>{throw new SyntaxError('invalid JSON');}};
  if(calls===1)return {ok:true,json:async()=>{throw new TypeError('body connection closed');}};
  return Response.json(series);
 });
 assert.equal((await api.getChartSeries('BODY','2020-01-01','2020-01-03')).points[0].close,100);
 assert.equal(calls,2);invalid=true;
 await assert.rejects(api.getChartSeries('MALFORMED','2020-01-01','2020-01-03'),/invalid JSON/);
 assert.equal(calls,3);
});
