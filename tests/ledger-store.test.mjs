import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTypescript} from './load-typescript.mjs';
const {createLedgerStore}=loadTypescript('src/features/portfolio/data/ledger-store.ts');
const tx=(id='a',price=100)=>({id,symbol:id.toUpperCase(),name:id,type:'buy',date:'2026-09-01',quantity:10,price,fee:0,currency:'USD',fxRateToKRW:1300,usdKrwRateAtTransaction:1300,createdAt:'2026-09-01T00:00:00Z'});
const validId=i=>`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
const record=(i,price=100)=>({...tx(validId(i),price),symbol:`QA${i}`});
function setup({fail=false,gate,cache}={}) {
 let current={transactions:[record(1),record(2)],revision:'0',writable:true};let writes=0;
 const repository={read:async()=>structuredClone(current),commit:async(change)=>{writes++;if(gate)await gate;if(fail)throw new Error('server failed');assert.equal(change.revision,current.revision);current={transactions:change.transactions,revision:String(Number(current.revision)+1),writable:true};return structuredClone(current)}};
 return {store:createLedgerStore({repository,cache}),read:()=>current,writes:()=>writes};
}
test('overlapping edits and add/delete run against latest committed records',async()=> {
 const {store,read}=setup();await store.start();
 const results=await Promise.all([
 store.execute({type:'update',id:validId(1),changes:{type:'buy',date:'2026-09-01',quantity:10,price:110}}),
 store.execute({type:'update',id:validId(2),changes:{type:'buy',date:'2026-09-01',quantity:10,price:120}}),
 store.execute({type:'add',transaction:record(3)}),store.execute({type:'delete',id:validId(1)})]);
 assert.ok(results.every(r=>r.error===null),JSON.stringify(results));
 assert.deepEqual(JSON.parse(JSON.stringify(read().transactions.map(t=>[t.id,t.price]))),[[validId(2),120],[validId(3),100]]);
});
test('failed server save is not successful and leaves confirmed records unchanged',async()=> {
 const {store,read}=setup({fail:true});await store.start();
 const result=await store.execute({type:'import',mode:'replace',records:[record(3)]});
 assert.match(result.error,/server failed/);assert.equal(read().transactions.length,2);assert.equal(store.getSnapshot().transactions.length,2);
});
test('late completion after account disposal never publishes into a new session',async()=> {
 let release;const gate=new Promise(r=>release=r);const {store}=setup({gate});await store.start();
 const pending=store.execute({type:'add',transaction:record(3)});await new Promise(r=>setTimeout(r,0));store.dispose();release();
 assert.ok((await pending).error);assert.equal(store.getSnapshot().transactions.length,2);
});
test('a failed local outbox write prevents any server mutation',async()=> {
 const cache={pending:()=>null,stage:()=>{throw new Error('quota')},confirm:()=>{},abandon:()=>{}};
 const {store,writes}=setup({cache});await store.start();
 assert.match((await store.execute({type:'add',transaction:record(3)})).error,/quota/);assert.equal(writes(),0);
});

function memoryStorage(){const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),values};}
const {transactionCache,localRepository}=loadTypescript('src/features/portfolio/data/local.ts');
test('replacement then concurrent add/restore merges against replacement, not pre-import state',async()=> {
 const {store,read}=setup();await store.start();
 await Promise.all([store.execute({type:'import',mode:'replace',records:[record(3)]}),store.execute({type:'add',transaction:record(4)}),store.execute({type:'restore',transaction:record(2)})]);
 assert.deepEqual(Array.from(read().transactions,t=>t.id).sort(),[validId(2),validId(3),validId(4)]);
});
test('remote deletions never resurrect from local cache; uncertain commit retries the same request',async()=> {
 const storage=memoryStorage();storage.setItem('stock-transactions:user',JSON.stringify([record(1)]));
 const cache=transactionCache(storage,'user');let current={transactions:[],revision:'0',writable:true},receipt,requests=[];
 const repository={read:async()=>current,commit:async change=>{requests.push(change.id);if(!receipt){receipt=change.id;current={transactions:change.transactions,revision:'1',writable:true};throw new Error('connection lost after commit');}assert.equal(change.id,receipt);return current;}};
 const store=createLedgerStore({repository,cache});await store.start();assert.equal(store.getSnapshot().transactions.length,0);
 assert.ok((await store.execute({type:'add',transaction:record(2)})).error);assert.equal(store.getSnapshot().status,'failed');
 assert.ok((await store.execute({type:'add',transaction:record(3)})).error);
 await store.retry();assert.equal(store.getSnapshot().status,'ready');assert.equal(requests[0],requests[1]);assert.equal(current.transactions.length,1);
 assert.equal(JSON.parse(storage.getItem('centifolio-local-original:user'))[0].id,validId(1));
});
test('server success with cache quota failure is explicit, recoverable, and not duplicate creation',async()=> {
 const storage=memoryStorage(),base=transactionCache(storage,'user');let fail=true;
 const cache={...base,confirm:records=>{if(fail)throw new Error('quota');base.confirm(records);}};
 let revision='0',records=[],receipt;
 const repository={read:async()=>({transactions:records,revision,writable:true}),commit:async c=>{if(!receipt){receipt=c.id;records=c.transactions;revision='1';}return {transactions:records,revision,writable:true};}};
 const store=createLedgerStore({repository,cache});await store.start();assert.ok((await store.execute({type:'add',transaction:record(1)})).error);assert.equal(store.getSnapshot().status,'cache-failed');
 fail=false;await store.retry();assert.equal(store.getSnapshot().status,'ready');assert.equal(records.length,1);
});
test('corrupt original local records block writes without overwriting recovery data',async()=> {
 const storage=memoryStorage();storage.setItem('stock-transactions','{broken');const repo=localRepository(storage,null);
 await assert.rejects(repo.read());assert.equal(storage.getItem('stock-transactions'),'{broken');
});
test('late initial load is ignored after disposal',async()=> {
 let finish;const store=createLedgerStore({repository:{read:()=>new Promise(r=>finish=r),commit:async()=>{throw Error('unused');}}});
 const start=store.start();await new Promise(r=>setTimeout(r,0));store.dispose();finish({transactions:[record(1)],revision:'old',writable:true});await start;assert.equal(store.getSnapshot().transactions.length,0);
});
test('holding removal deletes exact listing, all buys and sells, preserving other holdings',async()=> {
 const {store,read}=setup();await store.start();await store.execute({type:'deleteHolding',symbol:'QA1'});assert.deepEqual(Array.from(read().transactions,t=>t.symbol),['QA2']);
});

test('local commit quota, stale revisions, invalid outbox and reload lock failure preserve originals',async()=> {
 const storage=memoryStorage(),repo=localRepository(storage,null);const initial=await repo.read();await repo.commit({id:validId(9),revision:initial.revision,transactions:[record(1)]});
 await assert.rejects(repo.commit({id:validId(10),revision:initial.revision,transactions:[]}));
 const original=storage.getItem('stock-transactions');storage.setItem=()=>{throw Error('quota');};
 await assert.rejects(repo.commit({id:validId(11),revision:JSON.stringify([record(1)]),transactions:[]}));assert.equal(storage.getItem('stock-transactions'),original);
 const broken=memoryStorage();broken.setItem('centifolio-pending-transaction:user',JSON.stringify({id:validId(1),revision:'r',transactions:[{id:'bad'}]}));assert.throws(()=>transactionCache(broken,'user').pending());
 const store=createLedgerStore({repository:{read:async()=>({transactions:[],revision:'0',writable:true})},lock:async()=>{throw Error('lock unavailable');}});await store.start();await store.reload();assert.match(store.getSnapshot().error,/lock unavailable/);
});
