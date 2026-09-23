import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTypescript} from './load-typescript.mjs';

const {DATE_AXIS_HEIGHT,getAssetAxis,getReturnAxis,getChartDates,getDateLabelPosition}=loadTypescript('src/features/performance/chart-presentation.ts');
const points=(from,count)=>Array.from({length:count},(_,index)=>({date:new Date(Date.parse(from)+index*86_400_000).toISOString().slice(0,10)}));

test('asset chart uses one unit and round numeric ticks without changing financial values',()=>{
 const data=[{assetValue:15_800_000,cumulativeNetFlow:0},{assetValue:30_708_637,cumulativeNetFlow:11_872_000}];
 const before=JSON.stringify(data);const axis=getAssetAxis(data,'KRW');
 assert.equal(axis.unitLabel,'만원');
 assert.deepEqual(Array.from(axis.ticks),[10_000_000,15_000_000,20_000_000,25_000_000,30_000_000,35_000_000]);
 assert.deepEqual(axis.ticks.map(axis.format),['1,000','1,500','2,000','2,500','3,000','3,500']);
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
  assert.ok(axis.domain[0]>0);
  assert.equal(new Set(axis.ticks.map(axis.format)).size,axis.ticks.length);
 }
 const empty=getAssetAxis([{assetValue:NaN,cumulativeNetFlow:null}],'KRW');
 assert.deepEqual(Array.from(empty.ticks,empty.format),['0','1']);
 const withoutCash=getAssetAxis([{assetValue:0,cumulativeNetFlow:-120_000_000,cumulativeNetFlowKRW:-120_000_000}],'KRW');
 assert.equal(withoutCash.unitLabel,'원');
 assert.deepEqual(Array.from(withoutCash.domain),[0,1]);
});

test('asset axes fit the selected range, preserve sellout zero and leave readable padding',()=>{
 const selected=[{assetValue:30_100_000},{assetValue:30_700_000},{assetValue:30_300_000}];
 const fitted=getAssetAxis(selected,'KRW');
 assert.ok(fitted.domain[0]<30_100_000&&fitted.domain[0]>29_000_000);
 assert.ok(fitted.domain[1]>30_700_000&&fitted.domain[1]<32_000_000);
 const full=getAssetAxis([{assetValue:100},...selected],'KRW');
 assert.ok(full.domain[0]<=100);
 const sold=getAssetAxis([...selected,{assetValue:0}],'KRW');
 assert.equal(sold.domain[0],0);assert.ok(sold.domain[1]>=30_700_000);
 for(const [values,currency] of [
  [[100,10_000_000_000],'KRW'],[[100,101],'KRW'],[[0.01,0.02],'USD'],
  [[100_000_000_000,100_000_000_001],'KRW'],[[10_000_000_000,10_000_000_000.01],'USD'],
  [[0],'USD'],[[500],'KRW'],[[-100,-90],'KRW'],
 ]){
  const axis=getAssetAxis(values.map(assetValue=>({assetValue})),currency);
  assert.ok(axis.domain[0]<=Math.min(...values)&&axis.domain[1]>=Math.max(...values));
  assert.ok(axis.domain[1]>axis.domain[0]);
  assert.ok(axis.ticks.every(Number.isFinite));
  assert.equal(new Set(axis.ticks.map(axis.format)).size,axis.ticks.length);
  assert.ok(axis.width>=Math.max(...axis.ticks.map(tick=>axis.format(tick).length*8+24)));
 }
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

test('return axes include all displayed comparisons but exclude hidden and invalid values',()=>{
 const data=[{portfolioReturn:4,comparison0:-84,comparison8:57,hidden:5000,invalid:Infinity},{comparison0:null,comparison8:NaN}];
 const before=JSON.stringify(data);
 const axis=getReturnAxis(data,['portfolioReturn','comparison0','comparison8','invalid']);
 assert.ok(axis.domain[0]<=-84&&axis.domain[1]>=57);
 assert.ok(axis.domain[1]<5000);
 assert.equal(new Set(axis.ticks.map(axis.format)).size,axis.ticks.length);
 assert.equal(JSON.stringify(data),before);
});

test('date axis: month ticks use one full year-month line and retain calendar positions',()=>{
 const data=points('2026-07-05',79);
 for(const width of [1040,324]){
  const axis=getChartDates(data,width);
  assert.deepEqual(tickDates(axis),['2026-08-01','2026-09-01']);
  assert.deepEqual(Array.from(axis.domain),[Date.parse('2026-07-05'),Date.parse('2026-09-21')]);
  assert.equal(axis.format(Date.parse('2026-08-01')),'2026년 8월');
  assert.equal('yearBands' in axis,false);
 }
});

test('date axis: short histories keep regular UTC days and Monday week landmarks',()=>{
 const week=getChartDates(points('2026-09-15',7),324);
 assert.ok(week.ticks.length>=2&&week.ticks.length<=3);
 assert.equal(week.format(Date.parse('2026-09-15')),'9월 15일');
 for(let index=1;index<week.ticks.length;index++)assert.equal(week.ticks[index]-week.ticks[index-1],2*86_400_000);
 const month=getChartDates(range('2026-09-01','2026-09-30'),1040);
 assert.deepEqual(tickDates(month),['2026-09-07','2026-09-14','2026-09-21','2026-09-28']);
 assert.equal(getChartDates(range('2026-09-01','2026-09-30'),324).ticks.length,2);
 assert.equal('yearBands' in month,false);
});

test('date axis: two-year ranges reduce year-month labels to fit the actual plot width',()=>{
 const data=range('2024-09-23','2026-09-22');
 const desktop=getChartDates(data,1040);const narrow=getChartDates(data,324);
 assert.deepEqual(tickDates(desktop),['2025-01-01','2025-07-01','2026-01-01','2026-07-01']);
 assert.deepEqual(tickDates(narrow),['2025-01-01','2026-01-01']);
 assert.equal(desktop.format(Date.parse('2025-01-01')),'2025년 1월');
 assert.equal('yearBands' in desktop,false);
});

test('date axis: ten- and twenty-year ranges use regular full years on a single line',()=>{
 for(const [first,width,expected] of [
  ['2016-09-23',1040,[2018,2020,2022,2024,2026]],
  ['2016-09-23',324,[2018,2020,2022,2024,2026]],
  ['2016-09-23',234,[2020,2025]],
  ['2006-09-23',1040,[2010,2015,2020,2025]],
  ['2006-09-23',270,[2010,2015,2020,2025]],
  ['2006-09-23',234,[2010,2020]],
 ]){
  const axis=getChartDates(range(first,'2026-09-22'),width);
  assert.deepEqual(tickDates(axis),expected.map(year=>`${year}-01-01`));
  assert.equal(axis.format(Date.parse(`${expected[0]}-01-01`)),`${expected[0]}년`);
  assert.equal('yearBands' in axis,false);
 }
});

test('date axis: leap days and four-year format boundaries use real calendar dates',()=>{
 const leap=getChartDates(range('2024-02-27','2024-03-02'),1040);
 assert.deepEqual(tickDates(leap),['2024-02-27','2024-02-28','2024-02-29','2024-03-01','2024-03-02']);
 const twoYears=getChartDates(range('2024-01-01','2026-01-01'),324);
 assert.deepEqual(tickDates(twoYears),['2024-01-01','2025-01-01','2026-01-01']);
 const tenYears=getChartDates(range('2016-01-01','2026-01-01'),1040);
 assert.deepEqual(tickDates(tenYears),['2016-01-01','2018-01-01','2020-01-01','2022-01-01','2024-01-01','2026-01-01']);
 // Calendar months have different day counts, not equal point-index spacing.
 const months=getChartDates(range('2024-01-01','2024-04-01'),1040);
 assert.equal(months.ticks[1]-months.ticks[0],31*86_400_000);
 assert.equal(months.ticks[2]-months.ticks[1],29*86_400_000);
 const fourYears=getChartDates(range('2022-01-01','2026-01-01'),1040);
 const longer=getChartDates(range('2022-01-01','2026-01-02'),1040);
 assert.equal(fourYears.format(Date.parse('2024-01-01')),'2024년 1월');
 assert.equal(longer.format(Date.parse('2024-01-01')),'2024년');
});

test('date axis: calendar landmarks are independent of irregular unordered or missing observations',()=>{
 const data=[{date:'2026-09-22',portfolioReturn:12},{date:'2024-09-23',portfolioReturn:null},{date:'2025-04-09',portfolioReturn:3},{date:'2024-09-23',portfolioReturn:0},{date:'2025-02-30'},{date:'not-a-date'},{date:null}];
 const before=JSON.stringify(data);const axis=getChartDates(data,1040);
 assert.deepEqual(Array.from(axis.domain),[Date.parse('2024-09-23'),Date.parse('2026-09-22')]);
 assert.equal(tickDates(axis)[0],'2025-01-01');
 assert.ok(tickDates(axis).includes('2025-07-01'));
 assert.equal(new Set(axis.ticks).size,axis.ticks.length);
 assert.equal(JSON.stringify(data),before);
});

test('date axis: December to January keeps year context within each single-line date',()=>{
 const axis=getChartDates(range('2025-12-28','2026-01-08'),1040);
 assert.equal(axis.format(Date.parse('2025-12-28')),'2025년 12월 28일');
 assert.equal(axis.format(Date.parse('2026-01-01')),'2026년 1월 1일');
 assert.equal('yearBands' in axis,false);
 assert.ok(axis.ticks.map(axis.format).every(label=>!/[\r\n]/.test(label)));
});

test('date axis: single dates retain a valid domain while empty histories and unmeasured plots stay safe',()=>{
 for(const data of [[],[{date:'invalid'},{date:'2025-02-30'},{}]]){
  const empty=getChartDates(data,1040);
  assert.deepEqual(Array.from(empty.ticks),[]);assert.deepEqual(Array.from(empty.domain),[0,1]);
  assert.equal('yearBands' in empty,false);
 }
 const timestamp=Date.parse('2026-09-21');
 const single=getChartDates(points('2026-09-21',1),324);
 assert.deepEqual(Array.from(single.ticks),[timestamp]);
 assert.deepEqual(Array.from(single.domain),[timestamp-43_200_000,timestamp+43_200_000]);
 assert.equal(single.format(timestamp),'9월 21일');
 for(const width of [0,-1,NaN,Infinity]){
  const axis=getChartDates(range('2026-01-01','2026-09-22'),width);
  assert.deepEqual(Array.from(axis.ticks),[]);
  assert.deepEqual(Array.from(axis.domain),[Date.parse('2026-01-01'),Date.parse('2026-09-22')]);
 }
});

test('date axis: every supported period fits six or fewer labels with 24px gaps after edge clamping',()=>{
 assert.equal(DATE_AXIS_HEIGHT,36);
 const cases=[
  ['2026-09-16','2026-09-22'],['2026-08-24','2026-09-22'],['2026-06-25','2026-09-22'],
  ['2026-01-01','2026-09-22'],['2025-09-23','2026-09-22'],['2024-09-23','2026-09-22'],
  ['2016-09-23','2026-09-22'],['2006-09-23','2026-09-22'],['2025-12-28','2026-01-08'],
 ];
 for(const [first,last] of cases)for(const width of [234,270,324,1040]){
  const data=range(first,last),before=JSON.stringify(data),axis=getChartDates(data,width);
  assert.ok(axis.ticks.length>0&&axis.ticks.length<=6,`${first}..${last} at ${width}`);
  assert.equal('yearBands' in axis,false);
  let previousEnd=-Infinity;
  for(const tick of axis.ticks){
   assert.ok(tick>=Date.parse(first)&&tick<=Date.parse(last));
   assert.equal(tick%86_400_000,0,'calendar landmarks keep exact UTC dates');
   const label=axis.format(tick);
   assert.doesNotMatch(label,/[\r\n]/);
   const pointX=(tick-axis.domain[0])/(axis.domain[1]-axis.domain[0])*width;
   const placed=getDateLabelPosition(label,pointX,0,width);
   const left=placed.x-placed.width/2,right=placed.x+placed.width/2;
   assert.ok(left>=-1e-8&&right<=width+1e-8,`inside plot: ${label}`);
   assert.ok(left-previousEnd>=24-1e-8,`separated labels: ${label}`);
   previousEnd=right;
  }
  assert.equal(JSON.stringify(data),before);
 }
 const left=getDateLabelPosition('2026년 7월',60,60,294);
 const right=getDateLabelPosition('2026년 7월',294,60,294);
 assert.equal(left.x-left.width/2,60);assert.equal(right.x+right.width/2,294);
});
