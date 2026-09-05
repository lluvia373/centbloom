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
