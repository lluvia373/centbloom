import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTypescript} from './load-typescript.mjs';

const base={currency:'CNY',baseCurrency:'KRW',method:'daily-reference',source:'ecb-reference',
 points:[{date:'2026-09-20',close:206.5,referenceDate:'2026-09-18',carried:true,source:'ecb-reference'}]};

test('daily FX client retains applied dates and validates complete, positive, correctly sourced day records',async(t)=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 let result=base;const urls=[];
 globalThis.fetch=async url=>{urls.push(String(url));return new Response(JSON.stringify(result),{status:200});};
 const {getDailyFxHistory}=loadTypescript('src/lib/stock-api.ts');
 for(const invalid of [
  {...base,currency:'CNH'}, {...base,baseCurrency:'USD'}, {...base,source:'unknown'}, {...base,method:'spot'},
  {...base,points:[]}, {...base,points:[base.points[0],base.points[0]]},
  ...[{close:0},{date:'2026-09-19'},{referenceDate:'2026-09-21'},{referenceDate:'2026-09-12'},
    {referenceDate:'2026-02-30'},{carried:false},{source:'unknown'}].map(change=>({...base,points:[{...base.points[0],...change}]})),
 ]){
  result=invalid;
  await assert.rejects(getDailyFxHistory('CNY','2026-09-20','2026-09-20'),/날짜·출처·값/);
 }
 result=base;
 const valid=await getDailyFxHistory('CNY','2026-09-20','2026-09-20');
 assert.equal(valid.points[0].referenceDate,'2026-09-18');assert.equal(valid.points[0].carried,true);
 assert.ok(urls.every(url=>url==='/api/fx-history?currency=CNY&start=2026-09-20&end=2026-09-20'));
});

test('past new trade FX uses the common daily API while today and omitted dates use a current quote',async(t)=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 const urls=[];
 globalThis.fetch=async url=>{
  urls.push(String(url));
  return new Response(JSON.stringify(String(url).startsWith('/api/fx-history')?base:
   {symbol:'CNYKRW=X',currency:'KRW',price:207}),{status:200});
 };
 const {getFxRateToKRW}=loadTypescript('src/lib/stock-api.ts');
 const {fxToday}=loadTypescript('src/features/market/fx-history.ts');
 assert.equal(await getFxRateToKRW('CNY','2026-09-20'),206.5);
 assert.equal(await getFxRateToKRW('CNY',fxToday()),207);
 assert.equal(await getFxRateToKRW('CNY'),207);
 assert.equal(await getFxRateToKRW('KRW','2026-09-20'),1);
 assert.deepEqual(urls,['/api/fx-history?currency=CNY&start=2026-09-20&end=2026-09-20','/api/quote/CNYKRW%3DX']);
});

test('daily FX provider failures remain visible and cancelled requests cannot resolve normally',async(t)=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 globalThis.fetch=async()=>new Response(JSON.stringify({error:'2026-09-20 CNY 일별 환율 조회 실패'}),{status:503});
 const {getDailyFxHistory}=loadTypescript('src/lib/stock-api.ts');
 await assert.rejects(getDailyFxHistory('CNY','2026-09-20','2026-09-20'),/CNY 일별 환율 조회 실패/);
 const controller=new AbortController();controller.abort();
 await assert.rejects(getDailyFxHistory('CNY','2026-09-20','2026-09-20',controller.signal),{name:'AbortError'});
});
