import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTypescript} from './load-typescript.mjs';
const {buildDailyPerformance,PERFORMANCE_CALCULATION_VERSION,addCalendarDays,kstDate}=loadTypescript('src/lib/performance.ts');
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
test('shared history reuses a verified old prefix but recalculates the recent 90 days for source corrections',async(t)=> {
 const saved={calculationVersion:PERFORMANCE_CALCULATION_VERSION,revision:'r1',startedAt:tx.createdAt,points:Array.from({length:95},(_,i)=>point(addCalendarDays('2020-01-01',i))),serverSynced:true};
 const {loadPerformance,calls}=harness({saved});const resource=createSharedResource(loadPerformance,null,100000);
 const refreshed={...input,today:'2020-04-05'};
 const a=resource.subscribe('user:r1:2020-04-05',refreshed,()=>{}),b=resource.subscribe('user:r1:2020-04-05',refreshed,()=>{});
 t.after(()=>{a();b();});
 for(let i=0;i<200&&resource.snapshot('user:r1:2020-04-05').loading;i++)await new Promise(r=>setTimeout(r,5));assert.equal(calls.read,1);assert.equal(calls.calc.length,1);assert.equal(calls.save.length,1);assert.equal(calls.calc[0].previousPoints.length,5);assert.equal(calls.save[0].changed.length,91);a();b();
});
test('transaction revision, tracking start and missing prefix invalidate saved calculations',async()=> {
 const {loadPerformance,calls}=harness({saved:{calculationVersion:PERFORMANCE_CALCULATION_VERSION,revision:'old',startedAt:tx.createdAt,points:[point('2020-01-01')],serverSynced:true}});
 await loadPerformance(input,new AbortController().signal);assert.equal(calls.calc[0].previousPoints.length,0);assert.equal(calls.save[0].changed.length,3);
 const other=harness({saved:{calculationVersion:PERFORMANCE_CALCULATION_VERSION,revision:'r1',startedAt:tx.createdAt,points:[point('2020-01-02')],serverSynced:true}});
 await other.loadPerformance(input,new AbortController().signal);assert.equal(other.calls.calc[0].previousPoints.length,0);
 const shifted=harness({saved:{calculationVersion:PERFORMANCE_CALCULATION_VERSION,revision:'r1',startedAt:'2019-12-01T00:00:00Z',points:[point('2020-01-01')],serverSynced:true}});
 await shifted.loadPerformance(input,new AbortController().signal);assert.equal(shifted.calls.calc[0].previousPoints.length,0);
});
test('partial provider failure and account cancellation never save incomplete or late performance',async()=> {
 const failed=harness({fail:true});await assert.rejects(failed.loadPerformance(input,new AbortController().signal),/offline/);assert.equal(failed.calls.save.length,0);
 let release;const cancelled=harness({gate:new Promise(r=>release=r)});const controller=new AbortController();const task=cancelled.loadPerformance(input,controller.signal);controller.abort();release();await assert.rejects(task);assert.equal(cancelled.calls.save.length,0);
});

test('unversioned server snapshots and old calculations are rebuilt even when the ledger is unchanged', async()=> {
 for (const calculationVersion of [undefined, PERFORMANCE_CALCULATION_VERSION - 1]) {
  const badPoint={...point('2020-01-01'),assetValueKRW:10000};
  const {loadPerformance,calls}=harness({saved:{calculationVersion,revision:'r1',startedAt:tx.createdAt,points:[badPoint],serverSynced:true}});
  const result=await loadPerformance(input,new AbortController().signal);
  assert.equal(calls.calc[0].previousPoints.length,0);
  assert.equal(result.points[0].assetValueKRW,100);
  assert.equal(calls.save[0].changed.length,3);
  assert.equal(calls.save[0].history.calculationVersion,PERFORMANCE_CALCULATION_VERSION);
 }
});

test('history request plan excludes fully closed positions before interval and keeps carried/future positions',()=> {
 const {planHistoryRequests}=loadTypescript('src/features/performance/request-plan.ts');
 const closed=[tx,{...tx,id:'sale',date:'2020-01-02',type:'sell'}];
 assert.equal(planHistoryRequests(closed,'2020-01-03','2020-01-05').requests.length,0);
 const plan=planHistoryRequests([...closed,{...tx,symbol:'FUTURE',date:'2020-01-04',currency:'USD'}],'2020-01-03','2020-01-05');
 assert.deepEqual(Array.from(plan.requests,r=>r.symbol),['FUTURE','USDKRW=X']);
 assert.equal(planHistoryRequests([tx],'2020-05-01','2020-05-02').fallbackStart,'2019-12-25');
});

test('FX requests start at first holding, stop before a full sale, merge overlapping holdings and split re-entry',()=>{
 const {planHistoryRequests}=loadTypescript('src/features/performance/request-plan.ts');
 const trade=(date,extra={})=>({...tx,id:date,date,createdAt:date+'T00:00:00Z',currency:'CNY',...extra});
 const foreign=[trade('2026-09-10'),trade('2026-09-12',{type:'sell'}),trade('2026-09-15'),
  trade('2026-09-16',{id:'overlap',symbol:'QA2'}),trade('2026-09-17',{type:'sell'}),trade('2026-09-18',{symbol:'QA2',type:'sell'})];
 const requests=planHistoryRequests([{...tx,symbol:'KRW_ONLY',date:'2000-01-01'},...foreign],'2000-01-01','2026-09-20').requests.filter(r=>r.type==='fx');
 assert.deepEqual(Array.from(requests,r=>[r.key,r.start,r.end]),[
  ['CNY','2026-09-10','2026-09-11'],['CNY','2026-09-15','2026-09-17'],
 ]);
 const intraday=[trade('2026-09-19'),trade('2026-09-19',{id:'sell',type:'sell',createdAt:'2026-09-19T01:00:00Z'})];
 assert.equal(planHistoryRequests(intraday,'2026-09-19','2026-09-20').requests.filter(r=>r.type==='fx').length,0);
 const suspendedCurrency=planHistoryRequests([trade('2020-01-01',{currency:'RUB'}),trade('2020-01-03',{currency:'RUB',type:'sell'})],
  '2020-01-01','2026-09-20').requests.filter(r=>r.type==='fx');
 assert.equal(suspendedCurrency[0].end,'2020-01-02');
});

test('suspended listing retries only missing-history responses with an extended lookback before saving',async()=> {
 const calls=[];let saved=0;
 const {loadPerformance}=loadTypescript('src/features/performance/service.ts',{
 './repository':{readHistory:async()=>({saved:{calculationVersion:PERFORMANCE_CALCULATION_VERSION,revision:'r1',startedAt:tx.createdAt,points:Array.from({length:31},(_,i)=>point(`2020-01-${String(i+1).padStart(2,'0')}`)),serverSynced:true},startedAt:tx.createdAt}),saveHistory:async()=>{saved++;return null;}},
 './calculate':{calculateHistory:async data=>buildDailyPerformance(data)},
 '@/lib/stock-api':{getChartSeries:async(_symbol,start)=>{calls.push(start);if(calls.length===1)throw new Error('no recent history',{cause:404});return {points:[{date:'2020-01-01',close:100}]};}}
 });
 const result=await loadPerformance({...input,today:'2020-08-01'},new AbortController().signal);
 assert.deepEqual(calls,['2020-01-25','2019-12-25']);assert.equal(saved,1);assert.equal(result.points.at(-1).assetValueKRW,100);
});

test('foreign historical valuation uses daily FX, retains its actual reference day, and never rewrites transaction FX',async()=>{
 const calls={chart:[],fx:[],saved:[]};
 const foreign={...tx,currency:'CNY',fxRateToKRW:190};
 const original=JSON.stringify(foreign);
 const {loadPerformance}=loadTypescript('src/features/performance/service.ts',{
  './repository':{readHistory:async()=>({saved:null,startedAt:tx.createdAt}),saveHistory:async(_user,history)=>{calls.saved.push(history);return null;}},
  './calculate':{calculateHistory:async data=>buildDailyPerformance(data)},
  '@/lib/stock-api':{
   getChartSeries:async(symbol,start,end)=>{calls.chart.push({symbol,start,end});return {points:[{date:'2019-12-31',close:100}]};},
   getDailyFxHistory:async(currency,start,end)=>{calls.fx.push({currency,start,end});return {points:Array.from({length:3},(_,i)=>({date:addCalendarDays(start,i),close:200+i,referenceDate:i===2?'2020-01-02':addCalendarDays(start,i),carried:i===2,source:'ecb-reference'}))};},
   getQuote:async()=>{throw Error('past history must not request a live quote');},
  },
 });
 const result=await loadPerformance({...input,transactions:[foreign]},new AbortController().signal);
 assert.deepEqual(calls.chart.map(v=>v.symbol),['QA']);assert.deepEqual(calls.fx,[{currency:'CNY',start:'2020-01-01',end:'2020-01-03'}]);
 assert.equal(result.points.at(-1).assetValueKRW,20200);
 assert.equal(result.points.at(-1).fxReferences.CNY,'2020-01-02');
 assert.equal(calls.saved[0].points.at(-1).fxReferences.CNY,'2020-01-02');
 assert.equal(JSON.stringify(foreign),original);
});

test('today uses a current foreign rate without labeling it as yesterday reference and cannot save a failed current lookup',async()=>{
 const today=kstDate(),yesterday=addCalendarDays(today,-1);
 const foreign={...tx,currency:'USD',fxRateToKRW:1234,date:yesterday,createdAt:yesterday+'T00:00:00Z'};
 const calls={quote:[],saved:[]};let fail=false;
 const {loadPerformance}=loadTypescript('src/features/performance/service.ts',{
  './repository':{readHistory:async()=>({saved:null,startedAt:foreign.createdAt}),saveHistory:async(_user,history)=>{calls.saved.push(history);return null;}},
  './calculate':{calculateHistory:async data=>buildDailyPerformance(data)},
  '@/lib/stock-api':{
   getChartSeries:async()=>({points:[{date:yesterday,close:100}]}),
   getDailyFxHistory:async()=>({points:[yesterday,today].map(date=>({date,close:1300,referenceDate:yesterday,carried:date!==yesterday,source:'ecb-reference'}))}),
   getQuote:async symbol=>{calls.quote.push(symbol);if(fail)throw Error('current FX unavailable');return {currency:'KRW',price:1400};},
  },
 });
 const result=await loadPerformance({...input,today,transactions:[foreign]},new AbortController().signal);
 assert.equal(result.points[0].assetValueKRW,130000);assert.equal(result.points[1].assetValueKRW,140000);
 assert.equal(result.points[0].fxReferences.USD,yesterday);assert.equal(result.points[1].fxReferences,undefined);
 assert.equal(result.points[1].final,false);assert.deepEqual(calls.quote,['USDKRW=X']);
 fail=true;await assert.rejects(loadPerformance({...input,today,transactions:[foreign]},new AbortController().signal),/current FX unavailable/);
 assert.equal(calls.saved.length,1);
});

test('a today-only position does not depend on an unused historical reference rate',async()=>{
 const today=kstDate();
 const foreign={...tx,currency:'CNY',fxRateToKRW:200,date:today,createdAt:today+'T00:00:00Z'};
 const {loadPerformance}=loadTypescript('src/features/performance/service.ts',{
  './repository':{readHistory:async()=>({saved:null,startedAt:foreign.createdAt}),saveHistory:async()=>null},
  './calculate':{calculateHistory:async data=>buildDailyPerformance(data)},
  '@/lib/stock-api':{
   getChartSeries:async()=>({points:[{date:today,close:100}]}),
   getDailyFxHistory:async()=>{throw Error('unused historical source');},
   getQuote:async()=>({currency:'KRW',price:201}),
  },
 });
 const result=await loadPerformance({...input,today,transactions:[foreign]},new AbortController().signal);
 assert.equal(result.points[0].assetValueKRW,20100);assert.equal(result.points[0].fxReferences,undefined);
});

test('separate currency holding intervals are combined without requiring FX during the empty gap',async()=>{
 const trades=[{...tx,currency:'CNY',fxRateToKRW:190,date:'2020-01-02'},
  {...tx,id:'sale',currency:'CNY',fxRateToKRW:190,date:'2020-01-04',type:'sell'},
  {...tx,id:'rebuy',currency:'CNY',fxRateToKRW:190,date:'2020-01-06'}];
 const calls=[];
 const {loadPerformance}=loadTypescript('src/features/performance/service.ts',{
  './repository':{readHistory:async()=>({saved:null,startedAt:tx.createdAt}),saveHistory:async()=>null},
  './calculate':{calculateHistory:async data=>buildDailyPerformance(data)},
  '@/lib/stock-api':{
   getChartSeries:async()=>({points:[{date:'2020-01-01',close:100}]}),
   getDailyFxHistory:async(currency,start,end)=>{
    calls.push([currency,start,end]);
    assert.ok(start==='2020-01-02'||start==='2020-01-06');
    return {points:Array.from({length:2},(_,i)=>({date:addCalendarDays(start,i),close:200,referenceDate:addCalendarDays(start,i),carried:false,source:'ecb-reference'}))};
   },
   getQuote:async()=>{throw Error('unexpected current rate');},
  },
 });
 const result=await loadPerformance({...input,today:'2020-01-07',transactions:trades},new AbortController().signal);
 assert.deepEqual(calls,[['CNY','2020-01-02','2020-01-03'],['CNY','2020-01-06','2020-01-07']]);
 assert.deepEqual(Array.from(result.points,p=>p.assetValueKRW),[0,20000,20000,0,0,20000,20000]);
 assert.equal(result.points[1].fxReferences.CNY,'2020-01-02');assert.equal(result.points[5].fxReferences.CNY,'2020-01-06');
});
