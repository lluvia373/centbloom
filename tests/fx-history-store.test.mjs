import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTypescript} from './load-typescript.mjs';
const {createFxHistoryStore,fxYearKey,FX_HISTORY_PREFIX}=loadTypescript('src/features/market/server/fx-history-store.ts');
const day=(date,cny=8)=>`<Cube time="${date}"><Cube currency="USD" rate="1.2"/><Cube currency="KRW" rate="1600"/>${cny===null?'':`<Cube currency="CNY" rate="${cny}"/>`}</Cube>`;
const xml=rows=>`<gesmes:Envelope xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref"><Cube>${rows.join('')}</Cube></gesmes:Envelope>`;
function fixture(){
 const values=new Map([['news:v1:trending',{keep:true}]]);
 let clock=Date.parse('2026-09-21T03:00:00Z'),calls=0,failFetch=false,failWrite=false;
 let body=xml([day('1999-01-04'),day('2026-09-17'),day('2026-09-18')]);
 const storage={get:async key=>structuredClone(values.get(key)??null),put:async(key,value)=>{if(failWrite)throw Error('storage down');values.set(key,JSON.parse(value));}};
 const fetcher=async()=>{calls++;if(failFetch)throw Error('provider down');return new Response(body);};
 const store=createFxHistoryStore(storage,fetcher,()=>clock);
 return {store,storage,values,calls:()=>calls,advance:()=>{clock+=3600001;},body:value=>{body=value;},failFetch:()=>{failFetch=true;},failWrite:()=>{failWrite=true;}};
}
test('bootstrap persists all year bundles, shares one fetch, and preserves news keys',async()=>{
 const f=fixture();
 const results=await Promise.all(['CNY','USD','KRW'].map(c=>f.store.get(c,'2026-09-20','2026-09-21')));
 assert.equal(f.calls(),1);assert.equal(results[0].points[0].close,200);
 assert.equal(results[0].points[0].referenceDate,'2026-09-18');
 assert.ok(f.values.has(fxYearKey(1999)));assert.ok(f.values.has(fxYearKey(2026)));
 assert.deepEqual(f.values.get('news:v1:trending'),{keep:true});
 await f.store.get('CNY','2026-09-18','2026-09-20');assert.equal(f.calls(),1);
});
test('fresh store instance reads persistent history without the provider',async()=>{
 const f=fixture();await f.store.get('CNY','2026-09-20','2026-09-20');
 const restarted=createFxHistoryStore(f.storage,async()=>{throw Error('must not fetch');},()=>Date.parse('2026-09-21T03:10:00Z'));
 assert.equal((await restarted.get('CNY','2026-09-20','2026-09-20')).points[0].close,200);
});
test('provider outage preserves stored valid history but cannot fill a missing business day',async()=>{
 const f=fixture();await f.store.get('CNY','2026-09-20','2026-09-20');f.advance();f.failFetch();
 assert.equal((await f.store.get('CNY','2026-09-20','2026-09-20')).points[0].close,200);
 await assert.rejects(f.store.get('CNY','2026-09-16','2026-09-16'),/2026-09-16/);
});
test('90-day corrections replace same-date values without deleting older years',async()=>{
 const f=fixture();await f.store.get('CNY','2026-09-20','2026-09-20');f.advance();
 f.body(xml([day('2026-09-18',10)]));
 assert.equal((await f.store.get('CNY','2026-09-20','2026-09-20')).points[0].close,160);
 assert.ok(f.values.has(fxYearKey(1999)));
 assert.equal(f.values.get(fxYearKey(2026)).days.length,2);
});
test('incomplete update never deletes previously stored currencies',async()=>{
 const f=fixture();await f.store.get('CNY','2026-09-20','2026-09-20');f.advance();
 f.body(xml([day('2026-09-18',null)]));
 assert.equal((await f.store.get('CNY','2026-09-20','2026-09-20')).points[0].close,200);
});
test('failed bootstrap storage does not publish a completed index or pretend durability',async()=>{
 const f=fixture();f.failWrite();
 await assert.rejects(f.store.get('CNY','2026-09-20','2026-09-20'),/storage down/);
 assert.equal(f.values.has(FX_HISTORY_PREFIX+'index'),false);
});
test('truncated payload leaves prior history and completed index unchanged',async()=>{
 const f=fixture();await f.store.get('CNY','2026-09-20','2026-09-20');
 const before=structuredClone(f.values.get(FX_HISTORY_PREFIX+'index'));f.advance();f.body('<Cube time="2026-09-18">');
 await f.store.get('CNY','2026-09-20','2026-09-20');
 assert.deepEqual(f.values.get(FX_HISTORY_PREFIX+'index'),before);
});
test('New Year uses the previous-year reference before a new-year bundle exists',async()=>{
 const f=fixture();
 f.body(xml([day('1999-01-04'),day('2026-12-31')]));
 const store=createFxHistoryStore(f.storage,async()=>new Response(xml([day('1999-01-04'),day('2026-12-31')])),()=>Date.parse('2027-01-02T03:00:00Z'));
 const result=await store.get('CNY','2027-01-01','2027-01-02');
 assert.equal(result.points[0].referenceDate,'2026-12-31');
 assert.equal(result.points[1].referenceDate,'2026-12-31');
 assert.equal(f.values.has(fxYearKey(2027)),false);
});
test('a long collection outage resumes with full history, not a permanent 90-day hole',async()=>{
 const f=fixture(),old=Date.parse('2026-01-03T00:00:00Z');
 f.values.set(fxYearKey(2026),{version:1,fetchedAt:old,days:[{date:'2026-01-02',rates:{KRW:1,USD:1600/1.2,CNY:200,EUR:1600}}]});
 f.values.set(FX_HISTORY_PREFIX+'index',{version:1,checkedAt:old,firstDate:'1999-01-04',lastDate:'2026-01-02'});
 const urls=[];
 const store=createFxHistoryStore(f.storage,async url=>{urls.push(url);return new Response(xml([day('1999-01-04'),day('2026-03-02'),day('2026-09-18')]));},()=>Date.parse('2026-09-21T03:00:00Z'));
 assert.equal((await store.get('CNY','2026-03-02','2026-03-02')).points[0].close,200);
 assert.match(urls[0],/eurofxref-hist\.xml$/);
});
