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

const range=(first,last)=>[{date:first},{date:last}];
const tickDates=(axis)=>Array.from(axis.ticks,value=>new Date(value).toISOString().slice(0,10));
const normalized=(value)=>JSON.parse(JSON.stringify(value));

test('return axes include all displayed comparisons but exclude hidden and invalid values',()=>{
 const data=[{portfolioReturn:4,comparison0:-84,comparison8:57,hidden:5000,invalid:Infinity},{comparison0:null,comparison8:NaN}];
 const before=JSON.stringify(data);
 const axis=getReturnAxis(data,['portfolioReturn','comparison0','comparison8','invalid']);
 assert.ok(axis.domain[0]<=-84&&axis.domain[1]>=57);
 assert.ok(axis.domain[1]<5000);
 assert.equal(new Set(axis.ticks.map(axis.format)).size,axis.ticks.length);
 assert.equal(JSON.stringify(data),before);
});

test('month ticks follow the calendar without inserting arbitrary first and last observations',()=>{
 const data=points('2026-07-05',79);
 for(const width of [1040,324]){
  const axis=getChartDates(data,width);
  assert.deepEqual(tickDates(axis),['2026-08-01','2026-09-01']);
  assert.deepEqual(Array.from(axis.domain),[Date.parse('2026-07-05'),Date.parse('2026-09-21')]);
  assert.equal(axis.format(Date.parse('2026-08-01')),'8월');
  assert.deepEqual(normalized(axis.yearBands),[{year:2026,start:Date.parse('2026-07-05'),end:Date.parse('2026-09-21')}]);
 }
});

test('short histories use regular UTC day or Monday week landmarks and keep mobile labels sparse',()=>{
 const week=getChartDates(points('2026-09-15',7),324);
 assert.ok(week.ticks.length>=2&&week.ticks.length<=3);
 assert.equal(week.format(Date.parse('2026-09-15')),'9월 15일');
 for(let index=1;index<week.ticks.length;index++)assert.equal(week.ticks[index]-week.ticks[index-1],3*86_400_000);
 const month=getChartDates(range('2026-09-01','2026-09-30'),1040);
 assert.deepEqual(tickDates(month),['2026-09-07','2026-09-14','2026-09-21','2026-09-28']);
 assert.equal(getChartDates(range('2026-09-01','2026-09-30'),324).ticks.length,2);
 assert.deepEqual(Array.from(month.yearBands),[]);
});

test('two-year ranges use quarters on desktop and half-years on narrow screens',()=>{
 const data=range('2024-09-23','2026-09-22');
 const desktop=getChartDates(data,1040);const narrow=getChartDates(data,324);
 assert.deepEqual(tickDates(desktop),['2024-10-01','2025-01-01','2025-04-01','2025-07-01','2025-10-01','2026-01-01','2026-04-01','2026-07-01']);
 assert.deepEqual(tickDates(narrow),['2025-01-01','2025-07-01','2026-01-01','2026-07-01']);
 assert.deepEqual(normalized(desktop.yearBands),[
  {year:2024,start:Date.parse('2024-09-23'),end:Date.parse('2025-01-01')},
  {year:2025,start:Date.parse('2025-01-01'),end:Date.parse('2026-01-01')},
  {year:2026,start:Date.parse('2026-01-01'),end:Date.parse('2026-09-22')},
 ]);
 assert.equal(desktop.format(Date.parse('2025-01-01')),'1월');
});

test('ten- and twenty-year ranges use regular full-year labels without a redundant year band',()=>{
 for(const [first,width,expected] of [
  ['2016-09-23',1040,[2018,2020,2022,2024,2026]],
  ['2016-09-23',324,[2020,2025]],
  ['2006-09-23',1040,[2010,2015,2020,2025]],
  ['2006-09-23',324,[2010,2020]],
 ]){
  const axis=getChartDates(range(first,'2026-09-22'),width);
  assert.deepEqual(tickDates(axis),expected.map(year=>`${year}-01-01`));
  assert.equal(axis.format(Date.parse(`${expected[0]}-01-01`)),`${expected[0]}년`);
  assert.deepEqual(Array.from(axis.yearBands),[]);
 }
});

test('leap days remain true dates and exact calendar anniversaries do not coarsen the interval',()=>{
 const leap=getChartDates(range('2024-02-27','2024-03-02'),1040);
 assert.deepEqual(tickDates(leap),['2024-02-27','2024-02-28','2024-02-29','2024-03-01','2024-03-02']);
 const twoYears=getChartDates(range('2024-01-01','2026-01-01'),324);
 assert.deepEqual(tickDates(twoYears),['2024-01-01','2024-07-01','2025-01-01','2025-07-01','2026-01-01']);
 assert.deepEqual(Array.from(twoYears.yearBands,band=>band.year),[2024,2025]);
 const tenYears=getChartDates(range('2016-01-01','2026-01-01'),1040);
 assert.deepEqual(tickDates(tenYears),['2016-01-01','2018-01-01','2020-01-01','2022-01-01','2024-01-01','2026-01-01']);
 // Three calendar months have different day counts, not equal point-index spacing.
 const quarters=getChartDates(range('2024-01-01','2026-01-01'),1040);
 assert.equal(quarters.ticks[1]-quarters.ticks[0],91*86_400_000);
 assert.equal(quarters.ticks[3]-quarters.ticks[2],92*86_400_000);
});

test('calendar landmarks exist independently of irregular, unordered or missing observations',()=>{
 const data=[{date:'2026-09-22',portfolioReturn:12},{date:'2024-09-23',portfolioReturn:null},{date:'2025-04-09',portfolioReturn:3},{date:'2024-09-23',portfolioReturn:0},{date:'2025-02-30'},{date:'not-a-date'},{date:null}];
 const before=JSON.stringify(data);const axis=getChartDates(data,1040);
 assert.deepEqual(Array.from(axis.domain),[Date.parse('2024-09-23'),Date.parse('2026-09-22')]);
 assert.equal(tickDates(axis)[0],'2024-10-01');
 assert.ok(tickDates(axis).includes('2025-04-01'));
 assert.equal(new Set(axis.ticks).size,axis.ticks.length);
 assert.equal(JSON.stringify(data),before);
});

test('day ranges crossing December and January retain separate clipped year context',()=>{
 const axis=getChartDates(range('2025-12-28','2026-01-08'),1040);
 assert.equal(axis.format(Date.parse('2026-01-01')),'1월 1일');
 assert.deepEqual(normalized(axis.yearBands),[
  {year:2025,start:Date.parse('2025-12-28'),end:Date.parse('2026-01-01')},
  {year:2026,start:Date.parse('2026-01-01'),end:Date.parse('2026-01-08')},
 ]);
});

test('single dates get a nonzero time domain while empty or invalid histories have no ticks',()=>{
 for(const data of [[],[{date:'invalid'},{date:'2025-02-30'},{}]]){
  const empty=getChartDates(data,1040);
  assert.deepEqual(Array.from(empty.ticks),[]);assert.deepEqual(Array.from(empty.domain),[0,1]);
  assert.deepEqual(Array.from(empty.yearBands),[]);
 }
 const timestamp=Date.parse('2026-09-21');
 const single=getChartDates(points('2026-09-21',1),324);
 assert.deepEqual(Array.from(single.ticks),[timestamp]);
 assert.deepEqual(Array.from(single.domain),[timestamp-43_200_000,timestamp+43_200_000]);
 assert.equal(single.format(timestamp),'9월 21일');
});
