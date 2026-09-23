import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTypescript} from './load-typescript.mjs';

function quote(fx) {
 return {symbol:'USDKRW=X',currency:'KRW',price:1400,quotedAt:'2026-09-18T20:00:00Z',
  fetchedAt:'2026-09-23T00:00:00Z',fx:{method:'direct',components:[
   {symbol:'USDKRW=X',price:1400,sourceAt:'2026-09-18T20:00:00Z'},
  ],...fx}};
}

test('valuation-only FX remains available for valuations but never auto-fills today or undated trade FX',async(t)=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 const urls=[];
 globalThis.fetch=async url=>{urls.push(String(url));return new Response(JSON.stringify(quote({carried:true,valuationOnly:true})));};
 const {getQuote,getFxRateToKRW}=loadTypescript('src/lib/stock-api.ts');
 const {fxToday}=loadTypescript('src/features/market/fx-history.ts');
 const valuation=await getQuote('USDKRW=X');
 assert.equal(valuation.price,1400);assert.equal(valuation.fx.valuationOnly,true);
 assert.equal(valuation.fx.components[0].sourceAt,'2026-09-18T20:00:00Z');
 await assert.rejects(getFxRateToKRW('USD',fxToday()),/USD\/KRW 현재 환율.*평가액에만/);
 await assert.rejects(getFxRateToKRW('USD'),/USD\/KRW 현재 환율.*평가액에만/);
 // Each completed read is followed by a new request; every trade consumer still rejects valuation-only FX.
 assert.deepEqual(urls,['/api/quote/USDKRW%3DX','/api/quote/USDKRW%3DX','/api/quote/USDKRW%3DX']);
});

test('fresh and normal closed-market carried FX preserve current trade behavior',async(t)=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 for(const fx of [{},{carried:true}]) {
  globalThis.fetch=async()=>new Response(JSON.stringify(quote(fx)));
  const {getFxRateToKRW}=loadTypescript('src/lib/stock-api.ts');
  assert.equal(await getFxRateToKRW('USD'),1400);
 }
});

test('past transaction FX still uses dated references and KRW does not request a quote',async(t)=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 const urls=[];
 globalThis.fetch=async url=>{
  urls.push(String(url));
  assert.ok(String(url).startsWith('/api/fx-history?'));
  return new Response(JSON.stringify({currency:'USD',baseCurrency:'KRW',method:'daily-reference',source:'ecb-reference',
   points:[{date:'2020-01-03',close:1200,referenceDate:'2020-01-03',carried:false,source:'ecb-reference'}]}));
 };
 const {getFxRateToKRW}=loadTypescript('src/lib/stock-api.ts');
 assert.equal(await getFxRateToKRW('USD','2020-01-03'),1200);
 assert.equal(await getFxRateToKRW('KRW'),1);
 assert.deepEqual(urls,['/api/fx-history?currency=USD&start=2020-01-03&end=2020-01-03']);
});

test('today transaction enrichment cannot record a valuation-only FX rate',async(t)=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 globalThis.fetch=async()=>new Response(JSON.stringify(quote({carried:true,valuationOnly:true})));
 const {prepareTransactions}=loadTypescript('src/features/portfolio/model/enrichment.ts');
 const {todayISO}=loadTypescript('src/lib/format.ts');
 const transaction={id:'trade',symbol:'AAPL',name:'Apple',type:'buy',date:todayISO(),
  createdAt:new Date().toISOString(),price:100,quantity:1,fee:0,currency:'USD'};
 const originalTransaction=JSON.stringify(transaction);
 await assert.rejects(prepareTransactions([transaction],{type:'add',transaction},[]),/평가액에만/);
 assert.equal(JSON.stringify(transaction),originalTransaction);
 assert.equal(transaction.fxRateToKRW,undefined);
 assert.equal(transaction.usdKrwRateAtTransaction,undefined);
});

test('performance rejects valuation-only current FX before calculating or persisting returns',async()=>{
 const {kstDate,addCalendarDays}=loadTypescript('src/lib/performance.ts');
 const today=kstDate(),yesterday=addCalendarDays(today,-1);
 const transaction={id:'trade',symbol:'AAPL',name:'Apple',type:'buy',date:yesterday,
  createdAt:yesterday+'T00:00:00+09:00',price:100,quantity:1,fee:0,currency:'USD',
  fxRateToKRW:1300,usdKrwRateAtTransaction:1300};
 const originalTransaction=JSON.stringify(transaction);
 const calls={quotes:[],calculate:0,save:0};
 const {loadPerformance}=loadTypescript('src/features/performance/service.ts',{
  './repository':{
   readHistory:async()=>({saved:null,startedAt:transaction.createdAt}),
   saveHistory:async()=>{calls.save++;return null;},
  },
  './calculate':{calculateHistory:async()=>{calls.calculate++;return [];}},
  '@/lib/stock-api':{
   getChartSeries:async()=>({points:[{date:yesterday,close:100}]}),
   getDailyFxHistory:async()=>({points:[{date:yesterday,close:1300,referenceDate:yesterday,carried:false,source:'ecb-reference'}]}),
   getQuote:async symbol=>{calls.quotes.push(symbol);return quote({carried:true,valuationOnly:true});},
  },
 });
 await assert.rejects(loadPerformance({userId:'user',revision:'r1',transactions:[transaction],today},new AbortController().signal),
  {message:'USD/KRW 최신 환율 갱신 후 성과를 계산합니다.'});
 assert.deepEqual(calls,{quotes:['USDKRW=X'],calculate:0,save:0});
 assert.equal(JSON.stringify(transaction),originalTransaction);
});
