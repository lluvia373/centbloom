import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescript } from './load-typescript.mjs';
const { createLedgerStore } = loadTypescript('src/features/portfolio/data/ledger-store.ts');
const { localRepository } = loadTypescript('src/features/portfolio/data/local.ts');
const { DEFAULT_PORTFOLIO_ID: A, normalizeWorkspace, changePortfolios } = loadTypescript('src/features/portfolio/model/portfolios.ts');
const { deriveHoldings, validateTransactionHistory } = loadTypescript('src/lib/portfolio.ts');
const { serializeTransactionBackup, parseTransactionBackup } = loadTypescript('src/lib/transaction-backup.ts');
const B='00000000-0000-4000-8000-000000000002', C='00000000-0000-4000-8000-000000000003';
const folder=(id,name='test')=>({id,name,createdAt:'2026-01-01T00:00:00Z',isDefault:id===A});
const tx=(id,portfolioId=A,price=100,quantity=10,type='buy',date='2026-01-01')=>({id,symbol:'QA',name:'QA',portfolioId,price,quantity,type,date,fee:0,currency:'KRW',fxRateToKRW:1,usdKrwRateAtTransaction:1300,createdAt:`${date}T00:00:00Z`});
const storage=()=>{const values=new Map();return{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k),values};};
const plain=value=>JSON.parse(JSON.stringify(value));

test('legacy ledger receives one default portfolio without duplicated transactions or overwritten recovery source',async()=>{
 const memory=storage(), original=JSON.stringify([{...tx('old'),portfolioId:undefined}]);
 memory.setItem('stock-transactions',original);
 const repo=localRepository(memory,null), first=await repo.read(), again=await repo.read();
 assert.equal(first.portfolios.length,1);assert.equal(first.transactions[0].portfolioId,A);assert.equal(first.revision,again.revision);
 await repo.commit({id:'request',revision:first.revision,transactions:first.transactions,portfolios:first.portfolios});
 assert.equal((await repo.read()).transactions.length,1);assert.equal(memory.getItem('stock-transactions'),original);
});
test('portfolio commands and trades share the atomic local commit; selection and delete transfer are consistent',async()=>{
 const memory=storage(),store=createLedgerStore({repository:localRepository(memory,null)});await store.start();
 await store.execute({type:'add',transaction:tx('a')});
 assert.equal((await store.execute({type:'createPortfolio',portfolio:folder(B,'long name')})).error,null);
 assert.equal(store.getSnapshot().selectedPortfolioId,B);
 assert.equal((await store.execute({type:'renamePortfolio',id:B,name:'renamed'})).error,null);
 assert.ok((await store.execute({type:'deletePortfolio',id:A})).error);
 store.setSelectedPortfolioId(A);
 assert.equal((await store.execute({type:'deletePortfolio',id:A,targetPortfolioId:B})).error,null);
 const state=store.getSnapshot();assert.equal(state.portfolios.length,1);assert.equal(state.transactions[0].id,'a');assert.equal(state.transactions[0].portfolioId,B);
 assert.equal(state.selectedPortfolioId,B);
 assert.deepEqual(plain(state.transactions[0].costBasisPath),[A]);
 assert.ok((await store.execute({type:'deletePortfolio',id:B})).error);
 store.setSelectedPortfolioId('all');assert.equal(store.getSnapshot().selectedPortfolioId,'all');
 store.setSelectedPortfolioId('unknown');assert.equal(store.getSnapshot().selectedPortfolioId,'all');
});
test('other portfolio purchases cannot cover an oversold trade',()=>{
 assert.match(validateTransactionHistory([tx('a',A),tx('b',B,100,1,'sell','2026-01-02')]),/초과/);
});
test('aggregate cost basis is the sum of independent portfolios and is unchanged through nested transfers',()=>{
 let records=[tx('a',A,100),tx('b',B,200),tx('s',A,300,5,'sell','2026-01-02')],folders=[folder(A),folder(B),folder(C)];
 const before=deriveHoldings(records)[0];assert.equal(before.quantity,15);assert.equal(before.costBasisKRW,2500);
 ({transactions:records,portfolios:folders}=changePortfolios(folders,records,{type:'deletePortfolio',id:A,targetPortfolioId:B}));
 assert.equal(deriveHoldings(records)[0].costBasisKRW,2500);
 ({transactions:records,portfolios:folders}=changePortfolios(folders,records,{type:'deletePortfolio',id:B,targetPortfolioId:C}));
 assert.equal(deriveHoldings(records)[0].costBasisKRW,2500);
 assert.equal(validateTransactionHistory(records),null);
 const after=deriveHoldings([...records,tx('new-sale',C,400,3,'sell','2026-01-03')])[0];
 assert.equal(after.quantity,12);assert.equal(after.costBasisKRW,2000);
});
test('v2 backup preserves portfolio names and cost pools; v1 still loads; missing portfolio cannot become an orphan',()=>{
 const data={...tx('a',B),costBasisPath:[A]};
 const backup=parseTransactionBackup(JSON.parse(serializeTransactionBackup([data],[{...folder(B,'B'),isDefault:true}])));
 assert.equal(backup.ok,true);assert.equal(backup.backup.portfolios[0].name,'B');assert.deepEqual(plain(backup.backup.transactions[0].costBasisPath),[A]);
 const legacy=parseTransactionBackup({format:'centbloom-transactions',version:1,exportedAt:'2026-01-01',transactions:[{...tx('old'),portfolioId:undefined}]});assert.equal(legacy.ok,true);
 assert.throws(()=>normalizeWorkspace({portfolios:[folder(A)],transactions:[data]}),/찾지 못/);
});
test('destination historical sales never consume the incoming portfolio after transfer',()=>{
 const records=[tx('a',A,100),tx('b',B,200,10,'buy','2026-01-02'),tx('s',B,300,5,'sell','2026-01-03')];
 const before=deriveHoldings(records)[0];assert.equal(before.costBasisKRW,2000);
 const changed=changePortfolios([folder(A),folder(B)],records,{type:'deletePortfolio',id:A,targetPortfolioId:B});
 assert.equal(deriveHoldings(changed.transactions)[0].costBasisKRW,2000);
 assert.equal(validateTransactionHistory(changed.transactions),null);
 assert.equal(deriveHoldings([...changed.transactions,tx('new-sale',B,400,3,'sell','2026-01-04')])[0].costBasisKRW,1600);
});
test('late account load does not expose portfolio names after disposal and another account starts clean',async()=>{
 let complete;const first=createLedgerStore({repository:{read:()=>new Promise(resolve=>complete=resolve)}});
 const task=first.start();await new Promise(resolve=>setTimeout(resolve,0));first.dispose();
 complete({portfolios:[folder(A,'private')],transactions:[tx('secret')],revision:'old',writable:true});await task;
 assert.equal(first.getSnapshot().transactions.length,0);assert.equal(first.getSnapshot().portfolios.length,0);
 const next=createLedgerStore({repository:localRepository(storage(),'other')});await next.start();assert.equal(next.getSnapshot().transactions.length,0);assert.notEqual(next.getSnapshot().portfolios[0].name,'private');
});
test('scope replacement preserves other portfolios, duplicate merge stays singular, metadata backup restores names',async()=>{
 const store=createLedgerStore({repository:localRepository(storage(),null)});await store.start();
 await store.execute({type:'createPortfolio',portfolio:folder(B)});
 await store.execute({type:'add',transaction:tx('a',A)});await store.execute({type:'add',transaction:tx('b',B)});
 await store.execute({type:'import',records:[tx('a2',A)],mode:'replace',portfolioId:A});
 assert.deepEqual(plain(store.getSnapshot().transactions.map(t=>t.id).sort()),['a2','b']);
 const result=await store.execute({type:'import',records:[tx('a2',A)],mode:'merge',portfolioId:A});assert.equal(result.skippedCount,1);
 await store.execute({type:'import',records:[tx('c',C)],mode:'replace',portfolios:[{...folder(C,'restored'),isDefault:true}]});
 assert.equal(store.getSnapshot().portfolios[0].name,'restored');assert.equal(store.getSnapshot().transactions.length,1);
});
