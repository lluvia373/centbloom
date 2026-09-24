import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescript } from './load-typescript.mjs';

const { estimateDividend } = loadTypescript('src/features/portfolio/model/dividends.ts');
const announcement = changes => ({
  id:'event-1', symbol:'TEST', currency:'KRW', exDate:'2026-09-10', paymentDate:'2026-09-25',
  amountPerShare:100, marketTimeZone:'Asia/Seoul', sourceUrl:'https://example.com/announcement',
  status:'declared', entitlement:'ordinary-cash', shareBasis:'transaction-compatible', withholding:null, ...changes,
});
const tx = (id, date, quantity, type='buy', portfolioId='a') => ({
  id,date,quantity,type,portfolioId,symbol:'TEST',name:'test',price:1000,fee:0,
  currency:'KRW',createdAt:`${date}T00:00:00Z`,
});
const calc = (trades,event={},options={}) => estimateDividend(trades, announcement(event), {asOfDate:'2026-09-24',portfolioId:'all',...options});

test('ordinary dividend uses pre-ex-date shares; ex-date buy is excluded and sale preserves rights',()=>{
  const value=calc([tx('a','2026-09-01',10),tx('b','2026-09-09',3,'sell'),tx('c','2026-09-10',7,'sell'),tx('d','2026-09-10',2)]);
  assert.equal(value.quantity,7);assert.equal(value.grossAmount,700);assert.equal(value.paymentState,'scheduled');
  assert.equal(value.estimatedNetAmount,null);
  assert.equal(calc([tx('a','2026-09-10',10)]).status,'not-eligible');
});
test('fully sold positions retain prior entitlement and later repurchase is not counted',()=>{
  const value=calc([tx('a','2026-09-01',10),tx('b','2026-09-11',10,'sell'),tx('c','2026-09-12',30)]);
  assert.equal(value.quantity,10);assert.equal(value.grossAmount,1000);
});
test('portfolio scope and all agree without borrowing another portfolio shares',()=>{
  const trades=[tx('a','2026-09-01',10),tx('b','2026-09-01',20,'buy','b')];
  assert.equal(calc(trades,{}, {portfolioId:'a'}).grossAmount,1000);
  assert.equal(calc(trades,{}, {portfolioId:'b'}).grossAmount,2000);
  assert.equal(calc(trades).grossAmount,3000);
  assert.equal(calc([...trades,tx('c','2026-09-02',11,'sell')]).reason,'history');
});
test('future entitlement is a projection, and passing the payment date never marks receipt',()=>{
  const trades=[tx('a','2026-09-01',10),tx('future','2026-10-01',50)];
  assert.equal(calc(trades,{exDate:'2026-10-02',paymentDate:'2026-10-10'}).eligibility,'current-holding-projection');
  assert.equal(calc(trades,{paymentDate:'2026-09-20'}).paymentState,'date-passed');
  assert.equal(calc(trades,{paymentDate:null}).paymentState,'date-unknown');
  assert.equal(calc(trades).quantity,10);
});
test('tax is optional and event-specific: never apply a global 15.4 percent rule',()=>{
  const trades=[tx('a','2026-09-01',10)];
  assert.equal(calc(trades).estimatedNetAmount,null);
  assert.equal(calc(trades,{withholding:{rate:.15,sourceUrl:'https://example.com/tax'}}).estimatedNetAmount,850);
  assert.equal(calc(trades,{withholding:{rate:.154,sourceUrl:'https://example.com/tax'}}).estimatedNetAmount,846);
  for(const rate of [NaN,Infinity,-.1,1.1]) assert.equal(calc(trades,{withholding:{rate,sourceUrl:'https://example.com/tax'}}).estimatedNetAmount,null);
  assert.equal(calc(trades,{withholding:{rate:0,sourceUrl:''}}).estimatedNetAmount,null);
});
test('approved KST approximation includes all boundary-day trades in summer and winter',()=>{
  const us={marketTimeZone:'America/New_York',currency:'USD'};
  assert.equal(calc([tx('a','2026-09-10',10)],us).quantity,10);
  assert.equal(calc([tx('a','2026-09-10',10)],us).quantityBasis,'kst-day-end-estimate');
  assert.equal(calc([tx('a','2026-09-09',10)],us).quantity,10);
  assert.equal(calc([tx('a','2026-09-11',10)],us).status,'not-eligible');
  assert.equal(calc([tx('a','2026-01-10',10)],{...us,exDate:'2026-01-10',paymentDate:'2026-01-20'}).quantity,10);
  assert.equal(calc([tx('a','2026-09-10',10)],{marketTimeZone:'Asia/Tokyo'}).status,'not-eligible');
});
test('boundary-day sells reduce the same-day estimate; later trades cannot alter it',()=>{
  const us={marketTimeZone:'America/New_York',currency:'USD'};
  const trades=[tx('a','2026-09-09',10),tx('b','2026-09-10',2),tx('c','2026-09-10',3,'sell'),tx('d','2026-09-11',9,'sell')];
  assert.equal(calc(trades,us).quantity,9);
  assert.equal(calc([tx('a','2026-09-09',10),tx('b','2026-09-10',10,'sell')],us).status,'not-eligible');
  assert.equal(calc([tx('a','2026-09-09',10)],us).quantityBasis,'recorded-dates');
});
test('missing amounts, unverified split basis, special rights and cancelled notices stay distinct from zero',()=>{
  const trades=[tx('a','2026-09-01',10)];
  for(const amountPerShare of [null,NaN,Infinity,-1]) assert.equal(calc(trades,{amountPerShare}).reason,'announcement');
  assert.equal(calc(trades,{amountPerShare:0}).grossAmount,0);
  assert.equal(calc(trades,{shareBasis:'unverified'}).reason,'share-basis');
  assert.equal(calc(trades,{entitlement:'unsupported'}).reason,'entitlement');
  assert.equal(calc(trades,{paymentDate:'2026-09-05'}).reason,'entitlement');
  assert.equal(calc(trades,{status:'cancelled',amountPerShare:null}).status,'cancelled');
});
test('malformed event dates, source, zone and history do not generate estimated money',()=>{
  const trades=[tx('a','2026-09-01',10)];
  for(const event of [{exDate:'2026-02-30'},{paymentDate:'bad'},{sourceUrl:''},{marketTimeZone:'wrong'},{marketTimeZone:''},{currency:'GBp'}])
    assert.equal(calc(trades,event).status,'unavailable');
  for(const records of [[...trades,...trades],[tx('a','bad',10)],[tx('a','2026-09-01',Infinity)],[{...trades[0],portfolioId:undefined}]])
    assert.equal(calc(records).reason,'history');
  assert.throws(()=>calc(trades,{}, {asOfDate:'2026-02-30'}));
});
test('sold fractional holdings have no float residue while genuine tiny shares survive',()=>{
  assert.equal(calc([tx('a','2026-09-01',.1),tx('b','2026-09-02',.2),tx('c','2026-09-03',.3,'sell')]).status,'not-eligible');
  assert.equal(calc([tx('a','2026-09-01',1e-9)]).quantity,1e-9);
  assert.equal(calc([tx('a','2026-09-01',1e20),tx('b','2026-09-02',1e20,'sell'),tx('c','2026-09-03',1e-9)]).quantity,1e-9);
  assert.equal(calc([tx('c','2026-09-03',1e-9),tx('b','2026-09-02',1e20,'sell'),tx('a','2026-09-01',1e20)]).quantity,1e-9);
});
test('fractional shares, revised amount and repeat calculation preserve original records and never insert cash',()=>{
  const trades=Object.freeze([Object.freeze(tx('a','2026-09-01',.125))]);
  const original=JSON.stringify(trades),first=calc(trades);
  assert.equal(first.grossAmount,12.5);
  assert.equal(JSON.stringify(calc(trades)),JSON.stringify(first));
  assert.equal(calc(trades,{amountPerShare:200}).grossAmount,25);
  assert.equal(JSON.stringify(trades),original);
  assert.equal('transactions' in first,false);
});
