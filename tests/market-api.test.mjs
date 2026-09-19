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

test('portfolio display uses current full names without rewriting original holdings or amounts', () => {
 const {buildSummary}=loadTypescript('src/features/portfolio/model/summary.ts');
 const holding=Object.freeze({symbol:'005930.KS',name:'삼성전자',quantity:2,avgCost:100,currency:'KRW',costBasisKRW:200});
 const quote={symbol:'005930.KS',name:'Samsung Electronics Co., Ltd.',price:120,currency:'KRW',change:10};
 const result=buildSummary([holding],{'005930.KS':quote},{USD:1300},'KRW');
 assert.equal(result.holdings[0].name,'Samsung Electronics Co., Ltd.');
 assert.equal(holding.name,'삼성전자');
 assert.equal(result.totalValue,240);assert.equal(result.totalGainLoss,40);
 const missing=buildSummary([holding],{},{USD:1300},'KRW');
 assert.equal(missing.holdings[0].name,'Samsung Electronics Co., Ltd.');
 assert.equal(missing.holdings[0].valuationAvailable,false);
});

test('quote and search prefer full provider names while Korean aliases still resolve', async () => {
 const provider={
  providerRequests:{request:(_key,run)=>run(undefined)},
  MarketError:class extends Error {},
  yahoo:{
   quote:async()=>({symbol:'OXY',shortName:'Occidental Petroleum Corporatio',longName:'Occidental Petroleum Corporation',regularMarketPrice:58,currency:'USD'}),
   search:async()=>({quotes:[{symbol:'005930.KS',shortname:'SamsungElec',longname:'Samsung Electronics Co., Ltd.',exchange:'KOS',quoteType:'EQUITY'}]}),
  },
 };
 const {fetchQuote}=loadTypescript('src/features/market/server/quote.ts',{'./provider':provider});
 assert.equal((await fetchQuote('OXY')).name,'Occidental Petroleum Corporation');
 const {fetchSearch}=loadTypescript('src/features/market/server/search.ts',{'./provider':provider});
 const results=await fetchSearch('삼성전자','kr');
 assert.equal(results.length,1);
 assert.equal(results[0].name,'Samsung Electronics Co., Ltd.');
 provider.yahoo.search=async()=>({quotes:[{symbol:'005930.KS',longname:'Updated Provider Name',quoteType:'EQUITY'}]});
 assert.equal((await fetchSearch('삼성전자','kr'))[0].name,'Updated Provider Name');
 provider.yahoo.search=async()=>{throw new Error('offline');};
 assert.equal((await fetchSearch('삼성전자','kr'))[0].name,'Samsung Electronics Co., Ltd.');
});
