import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTypescript} from './load-typescript.mjs';

const {getAssetAxis,getReturnAxis,getChartDates}=loadTypescript('src/features/performance/chart-presentation.ts');
const points=(from,count)=>Array.from({length:count},(_,index)=>({date:new Date(Date.parse(from)+index*86_400_000).toISOString().slice(0,10)}));

test('asset chart uses one unit and round numeric ticks without changing financial values',()=>{
 const data=[{assetValue:15_800_000,cumulativeNetFlow:0},{assetValue:30_708_637,cumulativeNetFlow:11_872_000}];
 const before=JSON.stringify(data);const axis=getAssetAxis(data,'KRW');
 assert.equal(axis.unitLabel,'만원');
 assert.deepEqual(Array.from(axis.ticks),[0,10_000_000,20_000_000,30_000_000,40_000_000]);
 assert.deepEqual(axis.ticks.map(axis.format),['0','1,000','2,000','3,000','4,000']);
 assert.equal(JSON.stringify(data),before);
});

test('asset scale only follows displayed holdings and keeps small, large and USD units readable',()=>{
 for(const [data,currency,label] of [
  [[{assetValue:300,cumulativeNetFlow:-700}],'KRW','원'],
  [[{assetValue:874_000_000,cumulativeNetFlow:420_000_000}],'KRW','억원'],
  [[{assetValue:25_000,cumulativeNetFlow:10_000}],'USD','천 USD'],
  [[{assetValue:3_500_000,cumulativeNetFlow:1_000_000}],'USD','백만 USD'],
  [[{assetValue:3,cumulativeNetFlow:0}],'USD','USD'],
 ]){
  const axis=getAssetAxis(data,currency);assert.equal(axis.unitLabel,label);
  assert.ok(axis.domain[0]<=data[0].assetValue&&data[0].assetValue<=axis.domain[1]);
  assert.equal(axis.domain[0],0);
  assert.equal(new Set(axis.ticks.map(axis.format)).size,axis.ticks.length);
 }
 const empty=getAssetAxis([{assetValue:NaN,cumulativeNetFlow:null}],'KRW');
 assert.deepEqual(Array.from(empty.ticks,empty.format),['0','0.25','0.5','0.75','1']);
 const withoutCash=getAssetAxis([{assetValue:0,cumulativeNetFlow:-120_000_000,cumulativeNetFlowKRW:-120_000_000}],'KRW');
 assert.equal(withoutCash.unitLabel,'원');
 assert.deepEqual(Array.from(withoutCash.domain),[0,1]);
});

test('return axes avoid redundant decimals but preserve fractional tick differences and signs',()=>{
 const small=getReturnAxis([{portfolioReturn:-0.04,benchmarkReturn:0.04}]);
 assert.ok(small.domain[0]<=-0.04&&small.domain[1]>=0.04);
 assert.equal(new Set(small.ticks.map(small.format)).size,small.ticks.length);
 const large=getReturnAxis([{portfolioReturn:18,benchmarkReturn:0}]);
 assert.deepEqual(large.ticks.map(large.format),['0%','5%','10%','15%','20%']);
});

test('date labels stay sparse on mobile and use month landmarks over longer ranges',()=>{
 const data=points('2026-07-05',79);
 const desktop=getChartDates(data,1040);const mobile=getChartDates(data,324);
 assert.deepEqual(Array.from(desktop.ticks),['2026-07-05','2026-08-01','2026-09-01','2026-09-21']);
 assert.ok(mobile.ticks.length<=3);
 for(const dates of [desktop,mobile]){
  assert.equal(dates.ticks[0],'2026-07-05');assert.equal(dates.ticks.at(-1),'2026-09-21');
  assert.equal(new Set(dates.ticks).size,dates.ticks.length);
 }
 assert.equal(desktop.format('2026-08-01'),'8월');
 assert.equal(desktop.format('2026-09-21'),'9월 21일');
 const week=getChartDates(points('2026-09-15',7),324);
 assert.equal(week.ticks.length,3);assert.equal(week.format('2026-09-15'),'9월 15일');
});

test('single dates, empty histories and multi-year ranges retain unambiguous labels',()=>{
 assert.equal(getChartDates([],1000).ticks.length,0);
 assert.deepEqual(Array.from(getChartDates(points('2026-09-21',1),324).ticks),['2026-09-21']);
 const crossYear=getChartDates(points('2025-12-28',12),1000);
 assert.equal(crossYear.format('2026-01-01'),'26.1.1');
 const long=getChartDates(points('2020-01-01',2400),1000);
 assert.equal(long.ticks.length,6);assert.equal(long.format('2026-01-01'),'2026년 1월');
});
