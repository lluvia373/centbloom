import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTypescript} from './load-typescript.mjs';
const {createRequestCache}=loadTypescript('src/shared/async/request-cache.ts');
const {createSharedResource}=loadTypescript('src/shared/async/shared-resource.ts');
const tick=()=>new Promise(r=>setTimeout(r,5));
test('shared request survives one subscriber cancellation and is aborted at zero',async()=> {
 const cache=createRequestCache();let calls=0,finish,signal;
 const load=s=>{calls++;signal=s;return new Promise(r=>finish=r);};
 const a=new AbortController(),b=new AbortController();
 const first=cache.request('q',load,{signal:a.signal});const second=cache.request('q',load,{signal:b.signal});
 await tick();a.abort();await assert.rejects(first);assert.equal(signal.aborted,false);finish(7);assert.equal(await second,7);assert.equal(calls,1);
 const c=new AbortController();const pending=cache.request('x',load,{signal:c.signal});await tick();c.abort();await assert.rejects(pending);assert.equal(signal.aborted,true);
});
test('timeouts reject non-cooperative loaders; failures never enter cache; TTL and invalidation',async()=> {
 let now=0,calls=0;const cache=createRequestCache({now:()=>now});
 await assert.rejects(cache.request('hung',()=>new Promise(()=>{}),{timeoutMs:10}),/초과/);
 await assert.rejects(cache.request('q',()=>Promise.reject(new Error('offline'))));
 const load=async()=>++calls;
 assert.equal(await cache.request('q',load,{ttlMs:100}),1);assert.equal(await cache.request('q',load,{ttlMs:100}),1);
 now=101;assert.equal(await cache.request('q',load,{ttlMs:100}),2);cache.invalidate('q');assert.equal(await cache.request('q',load),3);
});
test('transport concurrency is bounded',async()=> {
 let active=0,max=0;const cache=createRequestCache({concurrency:3});
 await Promise.all(Array.from({length:20},(_,i)=>cache.request(String(i),async()=>{active++;max=Math.max(max,active);await tick();active--;return i;})));
 assert.equal(max,3);
});
test('duplicate performance consumers execute once; last release stops polling and stale publication',async(t)=> {
 let calls=0,finish,signal;const resource=createSharedResource((_,s)=>{calls++;signal=s;return new Promise(r=>finish=r);},0,15);
 const offA=resource.subscribe('one',{},()=>{});const offB=resource.subscribe('one',{},()=>{});t.after(()=>{offA();offB();});
 assert.equal(calls,1);offA();assert.equal(signal.aborted,false);finish(42);await tick();assert.equal(resource.snapshot('one').value,42);
 offB();await new Promise(r=>setTimeout(r,30));assert.equal(calls,1);assert.equal(resource.snapshot('one').value,0);
 const offC=resource.subscribe('new',{},()=>{});offC();finish(100);await tick();assert.equal(resource.snapshot('new').value,0);
});
const {createQuoteHub}=loadTypescript('src/features/market/quote-hub.ts');
test('quote polling shares symbols, stops unused subscriptions and keeps failure separate from last price',async(t)=> {
 const calls=[];let fail=false,release;const gate=new Promise(resolve=>release=resolve);
 const hub=createQuoteHub(async symbol=>{calls.push(symbol);await gate;if(fail)throw Error('offline');return {symbol,price:100,currency:'USD'};},20);
 const a=hub.subscribe(['A','B'],()=>{}),b=hub.subscribe(['B'],()=>{});t.after(()=>{a();b();release();});
 await tick();assert.equal(calls.filter(s=>s==='B').length,1);a();release();
 for(let i=0;i<200&&!hub.snapshot(['B']).quotes.B;i++)await tick();
 assert.equal(hub.snapshot(['B']).quotes.B.price,100);fail=true;
 for(let i=0;i<200&&!hub.snapshot(['B']).failedSymbols.length;i++)await tick();
 assert.equal(calls.filter(s=>s==='A').length,1);assert.deepEqual(Array.from(hub.snapshot(['B']).failedSymbols),['B']);
 b();const count=calls.length;await new Promise(r=>setTimeout(r,35));assert.equal(calls.length,count);
});

test('timed-out non-cooperative loaders release logical pool slots for later requests',async()=> {
 const cache=createRequestCache({concurrency:2});
 await Promise.all([assert.rejects(cache.request('hung-a',()=>new Promise(()=>{}),{timeoutMs:10})),assert.rejects(cache.request('hung-b',()=>new Promise(()=>{}),{timeoutMs:10}))]);
 assert.equal(await cache.request('recovered',async()=>42,{timeoutMs:100}),42);
});
