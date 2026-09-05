import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTypescript} from './load-typescript.mjs';
const api=loadTypescript('src/lib/stock-api.ts');
test('market request normalization shares quote and same-date USD calls; malformed prices are not cached',async()=> {
 const original=globalThis.fetch;let calls=[];let valid=false;
 globalThis.fetch=async(url)=>{calls.push(url);return {ok:true,json:async()=>url.includes('/historical/')?{close:1300}:url.includes('/chart/')?(valid?[{date:'2020-01-01',close:100}]:[{date:'2020-01-01',close:null}]):{price:100,currency:'USD'}};};
 try {
  await Promise.all([api.getQuote(' aapl '),api.getQuote('AAPL')]);assert.equal(calls.length,1);
  await Promise.all([api.getFxRateToKRW('USD','2020-01-01'),api.getFxRateToKRW('USD','2020-01-01')]);assert.equal(calls.length,2);
  await assert.rejects(api.getChart('AAPL'));valid=true;assert.equal((await api.getChart('AAPL'))[0].close,100);assert.equal(calls.length,4);
 } finally {globalThis.fetch=original;}
});

test('search route accepts default/all and a supported market, and rejects invalid markets before fetching',async()=> {
 const calls=[];
 class MarketError extends Error {constructor(message,status){super(message);this.status=status;}}
 const route=loadTypescript('src/app/api/search/route.ts',{
  'next/server':{NextResponse:{json:(data,options)=>({status:options?.status??200,data})}},
  '@/features/market/server/provider':{MarketError},
  '@/features/market/server/http':{marketResponseError:error=>({status:error.status})},
  '@/features/market/server/search':{fetchSearch:async(q,market)=>{calls.push({q,market});return [{symbol:'7203.T'}];}},
 });
 for(const suffix of ['', '&market=all','&market=jp']){
  const response=await route.GET({nextUrl:new URL('https://example.test/api/search?q=toyota'+suffix)});
  assert.equal(response.status,200);assert.equal(response.data[0].symbol,'7203.T');
 }
 for(const suffix of ['&market=JP','&market=invalid']) assert.equal((await route.GET({nextUrl:new URL('https://example.test/api/search?q=toyota'+suffix)})).status,400);
 assert.deepEqual(calls.map(call=>call.market),['all','all','jp']);
});

test('KRW holdings expose the unit exchange rate required by portfolio metrics; missing foreign FX stays unavailable',()=> {
 const {buildSummary}=loadTypescript('src/features/portfolio/model/summary.ts');
 const holding={symbol:'005930.KS',name:'Samsung',quantity:2,avgCost:100,currency:'KRW',costBasisKRW:200};
 const result=buildSummary([holding],{'005930.KS':{price:120,currency:'KRW',change:10}},{USD:1300},'KRW');
 assert.equal(result.holdings[0].currentFxRateToKRW,1);assert.equal(result.totalValue,240);assert.equal(result.totalGainLoss,40);
 const missing=buildSummary([{...holding,symbol:'AAPL',currency:'USD'}],{AAPL:{price:120,currency:'USD',change:10}},{},'KRW');
 assert.equal(missing.holdings[0].currentFxRateToKRW,0);
});
