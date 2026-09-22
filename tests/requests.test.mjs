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

test('queued requests receive their full network budget after acquiring a slot',async()=> {
 const cache=createRequestCache({concurrency:1});let release;
 const first=cache.request('busy',()=>new Promise(r=>release=r),{timeoutMs:500});
 const second=cache.request('queued',async()=>42,{timeoutMs:10,queueTimeoutMs:500});
 await new Promise(r=>setTimeout(r,35));release(1);
 assert.equal(await first,1);assert.equal(await second,42);
});

test('queue timeout never starts the loader and queued cancellation does not wait for a slot',async()=> {
 const {createPool}=loadTypescript('src/shared/async/pool.ts');
 const run=createPool(1);let release;
 const busy=run(()=>new Promise(r=>release=r));
 const controller=new AbortController();let calls=0;
 const queued=run(async()=>++calls,controller.signal);controller.abort();
 await assert.rejects(queued,{name:'AbortError'});assert.equal(calls,0);
 release();await busy;
 const cache=createRequestCache({concurrency:1});let unblock;
 const first=cache.request('busy',()=>new Promise(r=>unblock=r),{timeoutMs:500});
 await assert.rejects(cache.request('queued',async()=>++calls,{timeoutMs:100,queueTimeoutMs:10}),/대기 시간/);
 unblock(1);await first;
 assert.equal(await cache.request('next',async()=>42),42);assert.equal(calls,0);
});

test('subscribers share one bounded timeout retry and late attempts cannot replace the recovered value',async()=> {
 const cache=createRequestCache({concurrency:1});let calls=0,late;const signals=[];
 const load=s=>{signals.push(s);return ++calls===1?new Promise(r=>late=r):Promise.resolve(42);};
 const options={timeoutMs:10,ttlMs:1000,retry:{limit:1,delayMs:1,when:e=>e.name==='TimeoutError'}};
 assert.deepEqual(await Promise.all([cache.request('retry',load,options),cache.request('retry',load,options)]),[42,42]);
 assert.equal(calls,2);assert.equal(signals[0].aborted,true);assert.equal(signals[1].aborted,false);
 late(99);await tick();assert.equal(await cache.request('retry',load,options),42);assert.equal(calls,2);
});

test('retry limits, non-retryable errors and final subscriber cancellation are respected',async()=> {
 const cache=createRequestCache();let calls=0;
 const retry={limit:1,delayMs:1,when:e=>e.cause===503};
 const failed=async()=>{calls++;throw new Error('offline',{cause:503});};
 await assert.rejects(cache.request('limit',failed,{retry}),/offline/);assert.equal(calls,2);
 calls=0;
 await assert.rejects(cache.request('invalid',async()=>{calls++;throw new Error('invalid',{cause:400});},{retry}),/invalid/);
 assert.equal(calls,1);
 const controller=new AbortController();calls=0;let retried;
 const retrying=new Promise(r=>retried=r);
 const pending=cache.request('cancel',failed,{signal:controller.signal,retry:{...retry,delayMs:100,onRetry:retried}});
 await retrying;controller.abort();await assert.rejects(pending,{name:'AbortError'});
 await new Promise(r=>setTimeout(r,120));assert.equal(calls,1);
});

test('fast quotes notify subscribers before an unrelated slow quote completes',async(t)=>{
 let releaseSlow;const gate=new Promise(r=>releaseSlow=r);const published=[];
 const hub=createQuoteHub(async symbol=>{if(symbol==='SLOW')await gate;return {symbol,price:100,currency:'USD'};},60000);
 const off=hub.subscribe(['FAST','SLOW'],()=>published.push(Object.keys(hub.snapshot(['FAST','SLOW']).quotes).join(',')));
 t.after(()=>{off();releaseSlow()});
 for(let i=0;i<100&&!published.includes('FAST');i++)await tick();
 assert.ok(published.includes('FAST'),'fast quote must render while the slow request is pending');
 assert.equal(hub.snapshot(['FAST','SLOW']).loading,true);
 releaseSlow();
 for(let i=0;i<100&&hub.snapshot(['FAST','SLOW']).loading;i++)await tick();
 assert.equal(hub.snapshot(['FAST','SLOW']).loading,false);
});
