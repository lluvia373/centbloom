import assert from 'node:assert/strict';
import test from 'node:test';
import {performance} from 'node:perf_hooks';
import {writeFileSync} from 'node:fs';
import os from 'node:os';
import {loadTypescript} from './load-typescript.mjs';
const currency=loadTypescript('src/lib/currency.ts');
const baseline=loadTypescript('tests/reference/performance.ts', {'./currency':currency});
const improved=loadTypescript('src/lib/performance.ts');
export function fixture(days,count=20000) {
  const start='2020-01-01';
  const transactions=Array.from({length:count},(_,i)=>({id:String(i),symbol:'QA'+i%10,name:'QA',type:i%4===3?'sell':'buy',quantity:i%4===3?0.25:1,price:100+(i%17),fee:0.1,currency:i%2?'USD':'KRW',fxRateToKRW:i%2?1300:1,usdKrwRateAtTransaction:1300,date:improved.addCalendarDays(start,Math.floor(i/count*days)),createdAt:new Date(Date.UTC(2020,0,1,0,0,i)).toISOString()}));
  const points=Array.from({length:days},(_,i)=>({date:improved.addCalendarDays(start,i),close:100+i%13}));
  return {transactions,trackingStartDate:start,endDate:improved.addCalendarDays(start,days-1),pricesBySymbol:Object.fromEntries(Array.from({length:10},(_,i)=>['QA'+i,points])),fxByCurrency:{USD:points.map(p=>({...p,close:1300}))}};
}
test('cursor algorithm matches original, including fees, partial sales and inactive days',()=> {
  const input=fixture(90,1000);
  assert.deepEqual(JSON.parse(JSON.stringify(improved.buildDailyPerformance(input))),JSON.parse(JSON.stringify(baseline.buildDailyPerformance(input))));
  const prefix=improved.buildDailyPerformance({...input,endDate:'2020-02-01'});
  assert.deepEqual(JSON.parse(JSON.stringify(improved.buildDailyPerformance({...input,previousPoints:prefix}))),JSON.parse(JSON.stringify(baseline.buildDailyPerformance(input))));
});
test('strict calculation refuses missing data instead of valuing it at zero',()=> {
  assert.throws(()=>improved.buildDailyPerformance({...fixture(10,50),pricesBySymbol:{},strict:true}),/누락/);
});
if(process.argv.includes('--benchmark')) {
  const results=[];
  for(const days of [365,1825]) {
    const input=fixture(days);
    for(const fn of [baseline.buildDailyPerformance,improved.buildDailyPerformance]) fn(fixture(30,1000));
    const before=[],after=[];
    for(let i=0;i<3;i++) {
      let at=performance.now(); const a=baseline.buildDailyPerformance(input); before.push(performance.now()-at);
      at=performance.now(); const b=improved.buildDailyPerformance(input); after.push(performance.now()-at);
      assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));
    }
    results.push({days,transactions:20000,symbols:10,beforeMs:before,afterMs:after});
  }
  const report={measuredAt:new Date().toISOString(),node:process.version,platform:os.platform(),cpu:os.cpus()[0].model,repetitions:3,results};
  writeFileSync('work/performance-benchmark.json',JSON.stringify(report,null,2));console.log(report);
}

test('inactive periods, re-entry, currency units and current-day overrides keep original semantics',()=> {
 const transactions=[
  {id:'1',symbol:'QA',name:'QA',type:'buy',date:'2020-01-01',quantity:5,price:100,fee:1,currency:'GBp',fxRateToKRW:1600,usdKrwRateAtTransaction:1300,createdAt:'2020-01-01T00:00:00Z'},
  {id:'2',symbol:'QA',name:'QA',type:'sell',date:'2020-01-03',quantity:5,price:110,fee:2,currency:'GBp',fxRateToKRW:1600,usdKrwRateAtTransaction:1300,createdAt:'2020-01-03T00:00:00Z'},
  {id:'3',symbol:'QA',name:'QA',type:'buy',date:'2020-01-05',quantity:2,price:105,fee:1,currency:'GBp',fxRateToKRW:1610,usdKrwRateAtTransaction:1300,createdAt:'2020-01-05T00:00:00Z'}];
 const input={transactions,trackingStartDate:'2020-01-01',endDate:'2020-01-08',pricesBySymbol:{QA:[{date:'2019-12-31',close:100},{date:'2020-01-05',close:105}]},fxByCurrency:{GBP:[{date:'2019-12-31',close:1600},{date:'2020-01-05',close:1610}]}};
 assert.deepEqual(JSON.parse(JSON.stringify(improved.buildDailyPerformance(input))),JSON.parse(JSON.stringify(baseline.buildDailyPerformance(input))));
 const today=improved.kstDate();const current={...input,transactions:transactions.slice(0,1),trackingStartDate:today,endDate:today,currentPrices:{QA:120},currentFxRates:{GBP:1700}};
 assert.deepEqual(JSON.parse(JSON.stringify(improved.buildDailyPerformance(current))),JSON.parse(JSON.stringify(baseline.buildDailyPerformance(current))));
});
