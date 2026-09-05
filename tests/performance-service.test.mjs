import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTypescript} from './load-typescript.mjs';
const {buildDailyPerformance}=loadTypescript('src/lib/performance.ts');
const {createSharedResource}=loadTypescript('src/shared/async/shared-resource.ts');
const tx={id:'00000000-0000-4000-8000-000000000001',symbol:'QA',name:'QA',type:'buy',date:'2020-01-01',createdAt:'2020-01-01T00:00:00Z',price:100,quantity:1,fee:0,currency:'KRW',fxRateToKRW:1,usdKrwRateAtTransaction:1300};
const input={userId:'user',revision:'r1',transactions:[tx],today:'2020-01-03'};
const point=date=>({date,cutoffAt:date+'T14:59:59.000Z',assetValueKRW:100,twrIndex:100,netFlowKRW:0,cumulativeNetFlowKRW:100,cumulativeProfitKRW:0,active:true,final:true});
function harness({fail=false,saved,gate}={}) {
 const calls={read:0,chart:[],calc:[],save:[]};
 const {loadPerformance}=loadTypescript('src/features/performance/service.ts',{
 './repository':{readHistory:async()=>{calls.read++;if(gate)await gate;return {saved,startedAt:tx.createdAt};},saveHistory:async(_user,history,changed,signal)=>{signal.throwIfAborted();calls.save.push({history,changed});return null;}},
 './calculate':{calculateHistory:async data=>{calls.calc.push(data);return buildDailyPerformance(data);}},
 '@/lib/stock-api':{getChartSeries:async(symbol,start,end)=>{calls.chart.push({symbol,start,end});if(fail)throw Error('provider offline');return {points:[{date:'2019-12-31',close:100}],dividends:[],dividendStatus:'confirmed_zero'};}}
 });return {loadPerformance,calls};
}
test('shared history performs one read/calculation/save and reuses only a verified finalized prefix',async(t)=> {
 const saved={revision:'r1',startedAt:tx.createdAt,points:[point('2020-01-01'),point('2020-01-02')],serverSynced:true};
 const {loadPerformance,calls}=harness({saved});const resource=createSharedResource(loadPerformance,null,100000);
 const a=resource.subscribe('user:r1:2020-01-03',input,()=>{}),b=resource.subscribe('user:r1:2020-01-03',input,()=>{});
 t.after(()=>{a();b();});
 for(let i=0;i<200&&resource.snapshot('user:r1:2020-01-03').loading;i++)await new Promise(r=>setTimeout(r,5));assert.equal(calls.read,1);assert.equal(calls.calc.length,1);assert.equal(calls.save.length,1);assert.equal(calls.calc[0].previousPoints.length,2);assert.equal(calls.save[0].changed.length,1);a();b();
});
test('transaction revision, tracking start and missing prefix invalidate saved calculations',async()=> {
 const {loadPerformance,calls}=harness({saved:{revision:'old',startedAt:tx.createdAt,points:[point('2020-01-01')],serverSynced:true}});
 await loadPerformance(input,new AbortController().signal);assert.equal(calls.calc[0].previousPoints.length,0);assert.equal(calls.save[0].changed.length,3);
 const other=harness({saved:{revision:'r1',startedAt:tx.createdAt,points:[point('2020-01-02')],serverSynced:true}});
 await other.loadPerformance(input,new AbortController().signal);assert.equal(other.calls.calc[0].previousPoints.length,0);
 const shifted=harness({saved:{revision:'r1',startedAt:'2019-12-01T00:00:00Z',points:[point('2020-01-01')],serverSynced:true}});
 await shifted.loadPerformance(input,new AbortController().signal);assert.equal(shifted.calls.calc[0].previousPoints.length,0);
});
test('partial provider failure and account cancellation never save incomplete or late performance',async()=> {
 const failed=harness({fail:true});await assert.rejects(failed.loadPerformance(input,new AbortController().signal),/offline/);assert.equal(failed.calls.save.length,0);
 let release;const cancelled=harness({gate:new Promise(r=>release=r)});const controller=new AbortController();const task=cancelled.loadPerformance(input,controller.signal);controller.abort();release();await assert.rejects(task);assert.equal(cancelled.calls.save.length,0);
});

test('history request plan excludes fully closed positions before interval and keeps carried/future positions',()=> {
 const {planHistoryRequests}=loadTypescript('src/features/performance/request-plan.ts');
 const closed=[tx,{...tx,id:'sale',date:'2020-01-02',type:'sell'}];
 assert.equal(planHistoryRequests(closed,'2020-01-03','2020-01-05').requests.length,0);
 const plan=planHistoryRequests([...closed,{...tx,symbol:'FUTURE',date:'2020-01-04',currency:'USD'}],'2020-01-03','2020-01-05');
 assert.deepEqual(Array.from(plan.requests,r=>r.symbol),['FUTURE','USDKRW=X']);
 assert.equal(planHistoryRequests([tx],'2020-05-01','2020-05-02').fallbackStart,'2019-12-25');
});

test('suspended listing retries only missing-history responses with an extended lookback before saving',async()=> {
 const calls=[];let saved=0;
 const {loadPerformance}=loadTypescript('src/features/performance/service.ts',{
 './repository':{readHistory:async()=>({saved:{revision:'r1',startedAt:tx.createdAt,points:Array.from({length:31},(_,i)=>point(`2020-01-${String(i+1).padStart(2,'0')}`)),serverSynced:true},startedAt:tx.createdAt}),saveHistory:async()=>{saved++;return null;}},
 './calculate':{calculateHistory:async data=>buildDailyPerformance(data)},
 '@/lib/stock-api':{getChartSeries:async(_symbol,start)=>{calls.push(start);if(calls.length===1)throw new Error('no recent history',{cause:404});return {points:[{date:'2020-01-01',close:100}]};}}
 });
 const result=await loadPerformance({...input,today:'2020-02-02'},new AbortController().signal);
 assert.deepEqual(calls,['2020-01-25','2019-12-25']);assert.equal(saved,1);assert.equal(result.points.at(-1).assetValueKRW,100);
});
