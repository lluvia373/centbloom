import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescript } from './load-typescript.mjs';
const {priceObservation,conditionReached}=loadTypescript('src/features/watchlist/price-alerts.ts');
const now=Date.parse('2026-09-24T03:30:00Z');
const q={symbol:'AAPL',price:100,currency:'USD',quotedAt:'2026-09-24T03:29:00Z',fetchedAt:'2026-09-24T03:30:00Z'};
test('price conditions use inclusive bounds and actual quote time, never failed or stale prices',()=>{
  const below={direction:'below',threshold:100,currency:'USD',enabled:true};
  assert.equal(conditionReached(below,q,false,now),true);
  assert.equal(conditionReached({...below,direction:'above'},q,false,now),true);
  assert.equal(conditionReached(below,{...q,price:101},false,now),false);
  assert.equal(conditionReached(below,q,true,now),null);
  assert.equal(conditionReached({...below,currency:'KRW'},q,false,now),null);
  for(const bad of [{quotedAt:undefined},{fetchedAt:undefined},{price:NaN},{quotedAt:'2026-09-24T03:31:00Z'},
    {quotedAt:'2026-09-24T03:09:59Z'},{fetchedAt:'2026-09-24T03:27:59Z'}]) assert.equal(priceObservation({...q,...bad},false,now),null);
  assert.equal(priceObservation(q,false,now).quotedAt,q.quotedAt);
});
