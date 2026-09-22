import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate} from 'node:timers/promises';
import {loadTypescript} from './load-typescript.mjs';

test('shared history retains a complete result and failure throughout retry until full recovery',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const {createSharedResource}=loadTypescript('src/shared/async/shared-resource.ts');
 const pending=[];
 const empty={points:[],error:null};
 const complete={points:[{date:'2026-09-21',assetValueKRW:123}],error:null};
 const recovered={points:[{date:'2026-09-21',assetValueKRW:130}],error:null};
 const history=createSharedResource(()=>new Promise((resolve,reject)=>pending.push({resolve,reject})),empty,100);
 const stop=history.subscribe('account:revision:day',{},()=>{});
 t.after(stop);
 pending.shift().resolve(complete);await setImmediate();
 assert.equal(history.snapshot('account:revision:day').value,complete);
 t.mock.timers.tick(100);
 pending.shift().reject(new Error('GOOGL 조회 실패'));await setImmediate();
 assert.equal(history.snapshot('account:revision:day').value,complete);
 assert.equal(history.snapshot('account:revision:day').error,'GOOGL 조회 실패');
 t.mock.timers.tick(100);
 assert.equal(history.snapshot('account:revision:day').loading,true);
 assert.equal(history.snapshot('account:revision:day').error,'GOOGL 조회 실패');
 assert.equal(history.snapshot('account:revision:day').value,complete);
 pending.shift().resolve(recovered);await setImmediate();
 assert.equal(history.snapshot('account:revision:day').value,recovered);
 assert.equal(history.snapshot('account:revision:day').error,null);
});

test('history hook masks previous account revision date and disabled ledger or auth inputs',()=>{
 const input={user:{id:'account'},authLoading:false,revision:'r1',status:'ready',today:'2026-09-21',transactions:[]};
 const states=new Map();let resource;const subscriptions=[];
 const {usePerformanceHistory:readHistoryState}=loadTypescript('src/hooks/usePerformanceHistory.ts',{
  '@/features/performance/service':{loadPerformance:()=>{throw new Error('No network in hook scope test');}},
  '@/hooks/useAuth':{useAuth:()=>({user:input.user,loading:input.authLoading})},
  '@/hooks/usePortfolio':{useTransactions:()=>input},
  '@/shared/time/use-kst-date':{useKstDate:()=>input.today},
  '@/shared/async/shared-resource':{createSharedResource:(_,empty)=>resource={
   initial:{value:empty,loading:true,error:null},
   snapshot:key=>states.get(key)??resource.initial,
   subscribe:(key,request)=>{subscriptions.push({key,request});return ()=>{};},
  }},
  react:{useCallback:callback=>callback,useSyncExternalStore:(subscribe,snapshot)=>{subscribe(()=>{});return snapshot();}},
 });
 const key=JSON.stringify(['account','r1','2026-09-21']);
 const result={points:[{date:'2026-09-21',assetValueKRW:123}],trackingStartedAt:'2026-09-01',error:null};
 states.set(key,{value:result,loading:false,error:'시세 조회 실패'});
 let state=readHistoryState();assert.equal(state.points,result.points);
 assert.equal(state.scopeKey,key);assert.equal(state.refreshError,'시세 조회 실패');
 for(const change of [{user:{id:'other'}},{revision:'r2'},{today:'2026-09-22'}]){
  Object.assign(input,{user:{id:'account'},revision:'r1',today:'2026-09-21'},change);
  state=readHistoryState();assert.equal(state.points.length,0);assert.equal(state.loading,true);assert.equal(state.refreshError,null);
 }
 Object.assign(input,{user:{id:'account'},revision:'r1',today:'2026-09-21'});
 for(const change of [{status:'loading'},{authLoading:true},{today:''}]){
  Object.assign(input,{status:'ready',authLoading:false,today:'2026-09-21'},change);
  const count=subscriptions.length;state=readHistoryState();
  assert.equal(state.points.length,0);assert.equal(state.loading,true);assert.equal(subscriptions.length,count);
 }
 Object.assign(input,{status:'ready',authLoading:false,today:'2026-09-21'});
 states.set(key,{value:{...result,error:'성과 저장 실패'},loading:false,error:null});
 state=readHistoryState();assert.equal(state.points,result.points);
 assert.equal(state.refreshError,null);assert.equal(state.error,'성과 저장 실패');
});

test('history hook distinguishes an unconfirmed ledger failure from a confirmed empty ledger',()=>{
 const input={user:{id:'account'},authLoading:false,revision:'',status:'loading',error:null,today:'2026-09-21',transactions:[]};
 const empty={points:[],trackingStartedAt:null,error:null};
 const complete={points:[{date:'2026-09-21',assetValueKRW:123}],trackingStartedAt:'2026-09-01',error:null};
 const subscriptions=[];
 const {usePerformanceHistory:readHistoryState}=loadTypescript('src/hooks/usePerformanceHistory.ts',{
  '@/features/performance/service':{loadPerformance:()=>{throw new Error('No network in ledger state test');}},
  '@/hooks/useAuth':{useAuth:()=>({user:input.user,loading:input.authLoading})},
  '@/hooks/usePortfolio':{useTransactions:()=>input},
  '@/shared/time/use-kst-date':{useKstDate:()=>input.today},
  '@/shared/async/shared-resource':{createSharedResource:()=>({
   initial:{value:empty,loading:true,error:null},
   snapshot:()=>({value:input.revision==='confirmed' ? complete : empty,loading:false,error:null}),
   subscribe:(key,request)=>{subscriptions.push({key,request});return ()=>{};},
  })},
  react:{useCallback:callback=>callback,useSyncExternalStore:(subscribe,snapshot)=>{subscribe(()=>{});return snapshot();}},
 });
 for(const status of ['loading','ready','saving']){
  input.status=status;
  const state=readHistoryState();
  assert.equal(state.loading,true);assert.equal(state.error,null);assert.equal(state.points.length,0);
 }
 input.status='failed';input.error='거래 조회 실패';
 let state=readHistoryState();
 assert.equal(state.loading,false);assert.equal(state.error,'거래 조회 실패');assert.equal(state.refreshError,'거래 조회 실패');
 input.error=null;state=readHistoryState();
 assert.equal(state.error,'거래 기록을 불러오지 못했습니다.');assert.equal(state.loading,false);
 input.authLoading=true;state=readHistoryState();
 assert.equal(state.loading,true);assert.equal(state.error,null);
 input.authLoading=false;input.status='saving';state=readHistoryState();
 assert.equal(state.loading,true);assert.equal(state.error,null);assert.equal(state.refreshError,null);
 assert.equal(subscriptions.length,0,'Unconfirmed records must never request an empty performance history');
 input.status='ready';input.revision='empty';state=readHistoryState();
 assert.equal(state.loading,false);assert.equal(state.error,null);assert.equal(state.points.length,0);
 assert.equal(subscriptions.length,1,'A confirmed empty ledger may resolve to an empty performance history');
 input.revision='confirmed';state=readHistoryState();assert.equal(state.points,complete.points);
 input.status='failed';input.error='거래 재조회 실패';state=readHistoryState();
 assert.equal(state.points,complete.points);assert.equal(state.loading,false);assert.equal(state.error,null);
 assert.equal(state.refreshError,null,'A failed ledger reload must not discard the last confirmed revision');
 assert.equal(subscriptions.at(-1).request.revision,'confirmed');
});
