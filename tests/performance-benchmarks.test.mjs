import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate} from 'node:timers/promises';
import {loadTypescript} from './load-typescript.mjs';

const {buildBenchmarkData}=loadTypescript('src/features/performance/benchmark-data.ts');
const dates=['2026-09-18','2026-09-19','2026-09-20','2026-09-21'];
const points=dates.map((date,index)=>({date,portfolioReturn:index===1?null:index*2}));
const series=(symbol,quotes,dividendStatus='confirmed_zero')=>({symbol,points:quotes,dividendStatus,dividends:[]});
const ready=(symbol,quotes,status)=>({symbol,series:series(symbol,quotes,status),loading:false,error:null});

test('references share the selected start and carry prior close without mutating portfolio points',()=>{
 const input=structuredClone(points);const before=JSON.stringify(input);
 const benchmarks=[
  ready('VOO',[{date:'2026-09-17',close:100},{date:'2026-09-21',close:110}]),
  ready('NEW',[{date:'2026-09-21',close:200}]),
 ];
 const result=buildBenchmarkData(input,benchmarks);
 assert.equal(JSON.stringify(input),before);
 assert.deepEqual(Array.from(result.data,p=>p.portfolioReturn),[0,null,4,6]);
 assert.deepEqual(Array.from(result.data.slice(0,3),p=>p.benchmark_0),[0,0,0]);
 assert.ok(Math.abs(result.data.at(-1).benchmark_0-10)<1e-10);
 assert.deepEqual(Array.from(result.data,p=>p.benchmark_1),[null,null,null,null]);
 assert.equal(result.comparisons[0].status,'ready');
 assert.equal(result.comparisons[1].status,'missing-start');
});

test('all references retain independent loading, errors and missing-start states',()=>{
 const result=buildBenchmarkData(points,[
  ready('VOO',[{date:'2026-09-17',close:100},{date:'2026-09-21',close:95}]),
  {symbol:'QQQ',series:null,loading:true,error:null},
  {symbol:'FAIL',series:null,loading:false,error:'조회 실패'},
  ready('EMPTY',[]),
 ]);
 assert.deepEqual(Array.from(result.comparisons,p=>p.status),['ready','loading','error','missing-start']);
 assert.equal(result.comparisons[2].error,'조회 실패');
 assert.ok(Math.abs(result.data.at(-1).benchmark_0+5)<1e-10);
 for(const point of result.data)for(const key of ['benchmark_1','benchmark_2','benchmark_3'])assert.equal(point[key],null);
});

test('confirmed adjusted history uses one coherent dividend-inclusive basis',()=>{
 const quotes=[{date:'2026-09-17',close:100,adjustedClose:90},{date:'2026-09-21',close:105,adjustedClose:100}];
 const adjusted=buildBenchmarkData(points,[ready('VOO',quotes,'confirmed_amount')]);
 assert.equal(adjusted.comparisons[0].dividendLabel,'배당 포함');
 assert.ok(Math.abs(adjusted.data.at(-1).benchmark_0-(100/90-1)*100)<1e-10);
 for(const missingIndex of [0,1]){
  const incomplete=quotes.map((point,index)=>({...point,adjustedClose:index===missingIndex?undefined:point.adjustedClose}));
  const result=buildBenchmarkData(points,[ready('VOO',incomplete,'confirmed_amount')]);
  assert.equal(result.comparisons[0].dividendLabel,'가격 기준 · 배당 미반영');
  assert.ok(Math.abs(result.data.at(-1).benchmark_0-5)<1e-10);
 }
 const unavailable=buildBenchmarkData(points,[ready('VOO',quotes,'unavailable')]);
 assert.equal(unavailable.comparisons[0].dividendLabel,'가격 기준 · 배당 자료 없음');
 assert.ok(Math.abs(unavailable.data.at(-1).benchmark_0-5)<1e-10);
});

test('explicit invalid rows stay gaps, and future quotes never affect visible history',()=>{
 const quotes=[{date:'2026-09-17',close:100},{date:'2026-09-19',close:NaN},{date:'2026-09-21',close:120},{date:'2026-09-22',close:9000}];
 const before=JSON.stringify(quotes);
 const {data}=buildBenchmarkData(points,[ready('VOO',quotes)]);
 assert.equal(data[0].benchmark_0,0);assert.equal(data[1].benchmark_0,null);assert.equal(data[2].benchmark_0,null);
 assert.ok(Math.abs(data.at(-1).benchmark_0-20)<1e-10);
 assert.equal(JSON.stringify(quotes),before);
 for(const invalid of [0,-10,NaN,Infinity]){
  const result=buildBenchmarkData(points,[ready('VOO',[{date:'2026-09-17',close:invalid},{date:'2026-09-21',close:100}])]);
  assert.equal(result.comparisons[0].status,'missing-start');
  assert.ok(result.data.every(point=>point.benchmark_0===null));
 }
});

test('duplicate symbols, unsorted source history, empty ranges and overflow remain safe',()=>{
 const benchmark=ready('VOO',[{date:'2026-09-21',close:110},{date:'2026-09-17',close:100}]);
 const result=buildBenchmarkData(points,[benchmark,benchmark]);
 assert.equal(result.comparisons.length,1);assert.equal(result.comparisons[0].key,'benchmark_0');
 assert.ok(Math.abs(result.data.at(-1).benchmark_0-10)<1e-10);
 assert.equal(buildBenchmarkData([], [benchmark]).data.length,0);
 assert.equal(buildBenchmarkData(points,[]).comparisons.length,0);
 const overflow=buildBenchmarkData(points,[ready('BIG',[{date:'2026-09-17',close:Number.MIN_VALUE},{date:'2026-09-21',close:Number.MAX_VALUE}])]);
 assert.equal(overflow.data.at(-1).benchmark_0,null);
});

test('references include selected first-day movement and never use its closing price as the opening baseline',()=>{
 const selection=[{date:'2026-09-18'}];
 const result=buildBenchmarkData(selection,[
  ready('HELD',[{date:'2026-09-17',close:100},{date:'2026-09-18',close:120}]),
  ready('IPO',[{date:'2026-09-18',close:120}]),
 ]);
 assert.ok(Math.abs(result.data[0].benchmark_0-20)<1e-10);
 assert.equal(result.data[0].benchmark_1,null);
 assert.equal(result.comparisons[1].status,'missing-start');
});

function createStoreHarness(react){
 const requests=[];
 const benchmarkModule=loadTypescript('src/features/performance/use-benchmark-series.ts',{
  '@/lib/stock-api':{getChartSeries:(symbol,start,end,signal)=>new Promise((resolve,reject)=>requests.push({symbol,start,end,signal,resolve,reject}))},
  ...(react?{react}:{}),
 });
 return {...benchmarkModule,requests};
}

test('selection deduplicates symbols and preserves completed and pending requests when adding or reordering',async()=>{
 const h=createStoreHarness();const store=h.createBenchmarkSeriesStore();
 store.select([' voo ','VOO','QQQ'],'2026-09-18','2026-09-21');await setImmediate();
 assert.deepEqual(h.requests.map(r=>r.symbol),['VOO','QQQ']);
 assert.equal(h.requests[0].start,'2026-09-11');
 const complete=series('VOO',[{date:'2026-09-18',close:100}]);
 h.requests[0].resolve(complete);await setImmediate();
 store.select(['QQQ','VOO','DIA'],'2026-09-18','2026-09-21');await setImmediate();
 assert.deepEqual(h.requests.map(r=>r.symbol),['VOO','QQQ','DIA']);
 assert.equal(h.requests[1].signal.aborted,false);
 assert.equal(store.snapshot().entries.get('VOO').series,complete);
 assert.equal(store.snapshot().entries.get('QQQ').loading,true);
 const snapshot=store.snapshot();store.select(['DIA','QQQ','VOO'],'2026-09-18','2026-09-21');
 assert.equal(store.snapshot(),snapshot);
 store.dispose();
});

test('one failure and retry do not discard another target or its in-flight request',async()=>{
 const h=createStoreHarness();const store=h.createBenchmarkSeriesStore();
 store.select(['VOO','QQQ','DIA'],'2026-09-18','2026-09-21');await setImmediate();
 const complete=series('VOO',[{date:'2026-09-18',close:100}]);
 h.requests[0].resolve(complete);h.requests[1].reject(new Error('503'));await setImmediate();
 assert.equal(store.snapshot().entries.get('VOO').series,complete);
 assert.equal(store.snapshot().entries.get('QQQ').loading,false);
 assert.match(store.snapshot().entries.get('QQQ').error,/불러오지 못했습니다/);
 store.retry('QQQ');await setImmediate();
 assert.deepEqual(h.requests.map(r=>r.symbol),['VOO','QQQ','DIA','QQQ']);
 assert.equal(h.requests[2].signal.aborted,false);
 assert.equal(store.snapshot().entries.get('VOO').series,complete);
 h.requests[3].resolve(series('QQQ',[{date:'2026-09-18',close:80}]));await setImmediate();
 assert.equal(store.snapshot().entries.get('QQQ').error,null);
 store.dispose();
});

test('removal, range changes and unmount cancel only the applicable requests and ignore late completions',async()=>{
 const h=createStoreHarness();const store=h.createBenchmarkSeriesStore();
 store.select(['VOO','QQQ'],'2026-09-18','2026-09-21');await setImmediate();
 store.select(['VOO'],'2026-09-18','2026-09-21');
 assert.equal(h.requests[1].signal.aborted,true);assert.equal(h.requests[0].signal.aborted,false);
 h.requests[1].resolve(series('QQQ',[{date:'2026-09-18',close:80}]));await setImmediate();
 assert.equal(store.snapshot().entries.has('QQQ'),false);
 store.select(['VOO'],'2026-09-19','2026-09-21');await setImmediate();
 assert.equal(h.requests[0].signal.aborted,true);assert.equal(h.requests.length,3);
 h.requests[0].resolve(series('VOO',[{date:'2026-09-18',close:999}]));await setImmediate();
 assert.equal(store.snapshot().entries.get('VOO').series,null);
 assert.equal(store.snapshot().range,JSON.stringify(['2026-09-19','2026-09-21']));
 store.dispose();assert.equal(h.requests[2].signal.aborted,true);
 h.requests[2].resolve(series('VOO',[{date:'2026-09-19',close:100}]));await setImmediate();
 assert.equal(store.snapshot().entries.size,0);
});

test('empty inputs do not request history and strict-effect cleanup can safely resubscribe',async()=>{
 const h=createStoreHarness();const store=h.createBenchmarkSeriesStore();
 store.select(['VOO'],'','');await setImmediate();assert.equal(h.requests.length,0);
 store.select(['VOO'],'2026-09-18','2026-09-21');store.dispose();
 store.select(['VOO'],'2026-09-18','2026-09-21');await setImmediate();
 assert.equal(h.requests.length,1);
 store.select([],'2026-09-18','2026-09-21');assert.equal(h.requests[0].signal.aborted,true);
 store.retry('VOO');await setImmediate();assert.equal(h.requests.length,1);
 store.dispose();
});

test('hook masks previous range immediately before its synchronization effect executes',async()=>{
 let store;let effects=[];
 const h=createStoreHarness({
  useState:initialize=>[store??=initialize()],
  useMemo:compute=>compute(),
  useSyncExternalStore:(_subscribe,snapshot)=>snapshot(),
  useEffect:effect=>{effects.push(effect);},
 });
 let result=h.useBenchmarkSeries(['VOO'],'2026-09-18','2026-09-21');
 assert.equal(result.benchmarks[0].loading,true);
 effects.splice(0).forEach(effect=>effect());await setImmediate();
 h.requests[0].resolve(series('VOO',[{date:'2026-09-18',close:100}]));await setImmediate();
 result=h.useBenchmarkSeries(['VOO'],'2026-09-18','2026-09-21');assert.equal(result.benchmarks[0].loading,false);
 effects=[];
 result=h.useBenchmarkSeries(['VOO'],'2026-09-19','2026-09-21');
 assert.equal(result.benchmarks[0].series,null);assert.equal(result.benchmarks[0].loading,true);
 assert.equal(h.useBenchmarkSeries(['VOO'],'','').benchmarks.length,0);
 store.dispose();
});
