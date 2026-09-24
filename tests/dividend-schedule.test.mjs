import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTypescript } from './load-typescript.mjs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const {dividendSchedule}=loadTypescript('src/features/dividends/model.ts');
const {dividendWithholding}=loadTypescript('src/features/dividends/tax.ts');
const appleSource=JSON.parse(readFileSync('src/features/dividends/prepared.json','utf8'));
const {appleDividendFeed,combineDividendFeeds}=loadTypescript('src/features/dividends/feed.ts',{
  './prepared-korea.json':{default:JSON.parse(readFileSync('src/features/dividends/prepared-korea.json','utf8'))},
  './prepared-foreign.json':{default:JSON.parse(readFileSync('src/features/dividends/prepared-foreign.json','utf8'))},
  './prepared-etf.json':{default:JSON.parse(readFileSync('src/features/dividends/prepared-etf.json','utf8'))},
});
const feed=appleDividendFeed(appleSource);
const tx=(id,date,quantity=10,type='buy',portfolioId='a',symbol='AAPL')=>({id,date,quantity,type,portfolioId,symbol,name:symbol,price:100,fee:0,currency:'USD',createdAt:`${date}T00:00:00Z`});
const calc=(trades,scope='all')=>dividendSchedule(trades,feed,'2026-09-24',scope);
const tax={residence:'KR',account:'general',issuerCountry:'KR',instrument:'ordinary-share',distribution:'ordinary-cash',treatyEligible:true};

test('verified ordinary tax rules distinguish Korean 15.4% and treaty-eligible US 15%; unsupported profiles stay unknown',()=>{
  assert.equal(dividendWithholding(tax).rate,0.154);
  assert.equal(dividendWithholding({...tax,issuerCountry:'US'}).rate,0.15);
  for(const patch of [{residence:'unknown'},{account:'tax-advantaged'},{issuerCountry:'unknown'},{instrument:'other'},{distribution:'other'},{issuerCountry:'US',treatyEligible:false}])
    assert.equal(dividendWithholding({...tax,...patch}),null);
});

test('real three announcements yield $8 gross / $6.80 estimated net for ten eligible shares',()=>{
  const {rows}=calc([tx('1','2026-01-02')]);
  assert.equal(rows.length,3);
  assert.ok(Math.abs(rows.reduce((s,r)=>s+r.estimate.grossAmount,0)-8)<1e-10);
  assert.ok(Math.abs(rows.reduce((s,r)=>s+r.estimate.estimatedNetAmount,0)-6.8)<1e-10);
  assert.ok(rows.every(r=>r.estimate.paymentState==='date-passed'));
});

test('selected/all portfolios and account replacement do not retain another scope totals',()=>{
  const trades=[tx('1','2026-01-02'),tx('2','2026-01-02',20,'buy','b')];
  assert.equal(calc(trades,'a').rows[0].estimate.quantity,10);
  assert.equal(calc(trades,'b').rows[0].estimate.quantity,20);
  assert.equal(calc(trades).rows[0].estimate.quantity,30);
  assert.equal(calc([]).rows.length,0);
  assert.equal(calc([tx('other-account','2026-01-02',1)]).rows[0].estimate.quantity,1);
});

test('full sale after ex-date keeps historical rights; unknown symbols are not represented as zero dividends',()=>{
  const result=calc([tx('1','2026-01-02'),tx('2','2026-08-12',10,'sell'),tx('3','2026-01-02',1,'buy','a','UNSUPPORTED')]);
  assert.equal(result.rows.length,3);assert.equal(result.rows[0].estimate.quantity,10);
  assert.equal(result.missingSymbols[0],'UNSUPPORTED');assert.equal(result.partial,true);
});

test('user decision: boundary-day net shares estimate the dividend instead of holding it',()=>{
  const result=calc([tx('1','2026-01-02'),tx('2','2026-08-10',1)]);
  const held=result.rows.find(r=>r.event.exDate==='2026-08-10').estimate;
  assert.equal(held.status,'estimated');assert.equal(held.quantity,11);
  assert.equal(held.quantityBasis,'kst-day-end-estimate');
  assert.equal(held.grossAmount,2.97);
  assert.equal(result.rows.filter(r=>r.estimate.status==='estimated').length,3);
});

test('split-incompatible history is held; undisclosed events and no entitlement are not fabricated',()=>{
  assert.equal(calc([tx('1','2020-01-02')]).rows[0].estimate.reason,'share-basis');
  assert.equal(calc([tx('1','2026-09-01')]).rows.length,0);
  assert.equal(dividendSchedule([tx('1','2025-01-02')],feed,'2026-01-01','all').rows.length,0);
});

test('a fully closed old position does not block post-split purchases, but balances cannot cancel across portfolios',()=>{
  const old=[tx('old-buy','2019-01-02'),tx('old-sell','2019-01-03',10,'sell'),tx('new','2026-01-02',3)];
  assert.equal(calc(old).rows[0].estimate.quantity,3);
  const crossed=[tx('old-buy','2019-01-02'),tx('old-sell','2019-01-03',10,'sell','b'),tx('new','2026-01-02',3)];
  assert.equal(calc(crossed).rows[0].estimate.reason,'share-basis');
});

test('a thousand fractional buys display the same cents as one trade of equal total quantity',()=>{
  const single=calc([tx('single','2026-01-02')]).rows;
  const many=calc(Array.from({length:1000},(_,i)=>tx(`part-${i}`,'2026-01-02',0.01))).rows;
  const money=n=>new Intl.NumberFormat('ko-KR',{style:'currency',currency:'USD'}).format(n);
  for(let i=0;i<single.length;i++) {
    assert.equal(many[i].estimate.quantity,single[i].estimate.quantity);
    assert.equal(money(many[i].estimate.estimatedNetAmount),money(single[i].estimate.estimatedNetAmount));
  }
});

test('UI distinguishes an empty ledger, missing coverage and date-only estimates without fake receipt',()=>{
  const {DividendSchedule}=loadTypescript('src/features/dividends/DividendSchedule.tsx',{'./DividendSchedule.module.css':{default:{}}});
  const render=transactions=>renderToStaticMarkup(createElement(DividendSchedule,{transactions,portfolioId:'all',feed,asOfDate:'2026-09-24'}));
  assert.equal(render([]),'');
  assert.match(render([tx('1','2026-01-02',1,'buy','a','UNSUPPORTED')]),/자료 미확인: UNSUPPORTED/);
  const held=render([tx('1','2026-01-02'),tx('2','2026-08-10',1)]);
  assert.match(held,/하루 마감 수량으로 추정/);
  assert.match(held,/2\.97/);
  assert.doesNotMatch(held,/계산 보류/);
  assert.doesNotMatch(held,/USD\s*0[.,]00|수령 완료/);
  assert.match(held,/실제 입금액이 아닙니다/);
});

test('multiple sources use their own tax, missing payment dates remain calculable and ADRs never inherit US tax',()=>{
  const event={...feed.events[0],id:'KR:2026-02-09',symbol:'005930.KS',name:'삼성전자',currency:'KRW',marketTimeZone:'Asia/Seoul',paymentDate:null,amountPerShare:372,issuerCountry:'KR',treatyEligible:false};
  const foreign={...event,id:'ADR:2026-02-09',symbol:'BABA',currency:'USD',issuerCountry:'unknown',instrument:'adr',amountPerShare:1.05};
  const source={...feed,events:[event,foreign],symbols:[{...feed.symbols[0],symbol:event.symbol},{...feed.symbols[0],symbol:foreign.symbol}]};
  const combined=combineDividendFeeds(feed,source);
  const result=dividendSchedule([tx('us','2026-01-02'),tx('kr','2026-01-02',10,'buy','a',event.symbol),tx('adr','2026-01-02',10,'buy','a',foreign.symbol)],combined,'2026-09-24','all');
  const kr=result.rows.find(row=>row.event.symbol===event.symbol);
  assert.equal(kr.estimate.status,'estimated');assert.equal(kr.estimate.grossAmount,3720);assert.equal(kr.rate,.154);
  assert.equal(kr.estimate.paymentState,'date-unknown');
  assert.equal(result.rows.find(row=>row.event.symbol==='BABA').estimate.estimatedNetAmount,null);
  assert.equal(result.partial,false);
  assert.throws(()=>combineDividendFeeds(feed,feed),/Overlapping/);
});

test('coverage reflects the selected portfolio; known no announcements differs from failed, unsupported and an empty feed',()=>{
  const source={...feed,events:[],symbols:[{...feed.symbols[0],symbol:'NONE',status:'no-announcement'}, {...feed.symbols[0],symbol:'FAIL',status:'failed'}]};
  const trades=[tx('a','2026-01-02',10,'buy','a','NONE'),tx('b','2026-01-02',10,'buy','b','FAIL')];
  const one=dividendSchedule(trades,source,'2026-09-24','a');
  assert.equal(one.noAnnouncements.join(','),'NONE');assert.equal(one.missingSymbols.length,0);assert.equal(one.partial,false);
  assert.equal(dividendSchedule(trades,source,'2026-09-24','b').missingSymbols.join(','),'FAIL');
  const {DividendSchedule}=loadTypescript('src/features/dividends/DividendSchedule.tsx',{'./DividendSchedule.module.css':{default:{}}});
  const render=(portfolioId,customFeed=source)=>renderToStaticMarkup(createElement(DividendSchedule,{transactions:trades,portfolioId,feed:customFeed,asOfDate:'2026-09-24'}));
  assert.equal(render('empty'),'');assert.match(render('a'),/배당 발표 없음: NONE/);
  assert.match(render('b'),/자료 미확인: FAIL/);assert.doesNotMatch(render('b'),/0\.00/);
  assert.match(render('a',{...source,symbols:[]}),/자료 미확인: NONE/);
});

test('a failed update retains source facts but cannot show a possibly cancelled old payout as current',()=>{
  const failed={...feed,symbols:feed.symbols.map(item=>({...item,status:'failed'}))};
  const result=dividendSchedule([tx('a','2026-01-02')],failed,'2026-09-24','all');
  assert.equal(result.rows.length,0);assert.equal(result.missingSymbols.join(','),'AAPL');
  assert.equal(failed.events.length,3);
  const empty=combineDividendFeeds({...failed,sourceCheckedAt:null,events:[],symbols:failed.symbols.map(item=>({...item,checkedAt:null}))});
  assert.equal(empty.sourceCheckedAt,null);
});

test('prepared local sources cover all thirteen held symbols without calling missing data zero',()=>{
  const combined=combineDividendFeeds(...['korea','foreign','etf'].map(name=>JSON.parse(readFileSync(`src/features/dividends/prepared-${name}.json`,'utf8'))));
  const symbols=['005930.KS','035420.KS','459580.KS','AAPL','GOOGL','SBUX','BAC','OXY','BABA','9988.HK','NU','GRAB','SOC'];
  assert.equal(combined.symbols.length,13);
  const trades=symbols.map((symbol,i)=>tx(`held-${i}`,'2025-01-02',10,'buy','a',symbol));
  const result=dividendSchedule(trades,combined,'2026-09-24','all');
  assert.equal(result.missingSymbols.length,0);
  assert.equal(result.noAnnouncements.slice().sort().join(','),'GRAB,NU,SOC');
  assert.equal(result.partialSymbols.join(','),'OXY');
  for(const symbol of symbols.filter(symbol=>!['NU','GRAB','SOC'].includes(symbol)))
    assert.ok(result.rows.some(row=>row.event.symbol===symbol&&row.estimate.status==='estimated'),symbol);
  const etf=dividendSchedule([tx('recent','2026-09-11',66,'buy','a','459580.KS')],combined,'2026-09-24','all');
  assert.equal(etf.rows.length,0);assert.equal(etf.missingSymbols.length,0);
});
