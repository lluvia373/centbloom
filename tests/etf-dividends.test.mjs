import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescript } from './load-typescript.mjs';
import { createKodexClient, collectKodexDividends } from '../scripts/prepare-etf-dividends.mjs';

const { parseKodexNotices, verifyKodexNotice, prepareKodexDividends } = loadTypescript('src/features/dividends/etf.ts');
const { calendars } = loadTypescript('src/features/market/schedule/calendars.ts');
const calendar = calendars.find(row => row.id === 'KR');
const noticeHtml = '<li><a href="notice-view.do?no=123"><h3>(&#39;26.1월_월말배당) Kodex ETF 분배금 공지</h3><span class="date">2026.01.28</span></a></li>';
const notice = parseKodexNotices(noticeHtml).notices;
function fixture() {
  const row = { basicD:'20260130', dividA:'2572', payD:'20260203', taxDividA:'2572' };
  return { data: { dividList:[row], lastleDivid:row, dividInfo:{fId:'2ETFJ8',fNm:'KODEX CD금리액티브(합성)'} },
    product: {info:{stkCd:'KR7459580007',product:{fId:'2ETFJ8',stkTicker:'459580',fNm:'KODEX CD금리액티브(합성)',listD:'20230608',gijunYMD:'20260204'},
      divideList:[{BASIC_D:'20260130',DIVID_A:2572,PAY_D:'20260203',TAX_DIVID_A:2572}]}} };
}
const prepare = (f, previous = null) => prepareKodexDividends(f.data, f.product, notice, calendar, '2026-02-04T01:00:00Z', previous);

test('actual issuer facts stay distinct: announcement, record, ex-date and payment; ETF tax stays unknown', () => {
  const event = prepare(fixture()).events[0];
  assert.equal(event.declaredDate, '2026-01-28');
  assert.equal(event.recordDate, '2026-01-30');
  assert.equal(event.exDate, '2026-01-29');
  assert.equal(event.paymentDate, '2026-02-03');
  assert.equal(event.amountPerShare, 2572);
  assert.equal(event.instrument, 'other');
  assert.equal(event.withholding, null);
});

test('mapping, duplicate, malformed date and source disagreement fail rather than make zero dividends', () => {
  for (const change of [f=>f.product.info.product.stkTicker='005930', f=>f.data.dividList.push({...f.data.dividList[0]}),
    f=>f.data.dividList[0].payD='20260231', f=>f.product.info.divideList[0].DIVID_A=2500,
    f=>f.data.dividList[0].taxDividA='3000']) { const f = fixture(); change(f); assert.throws(()=>prepare(f)); }
});

test('missing completed month or changed historical distribution preserves prior feed', () => {
  const f = fixture(), prior = prepare(f), saved = JSON.stringify(prior);
  f.product.info.product.gijunYMD='20260303';
  assert.throws(()=>prepareKodexDividends(f.data,f.product,notice,calendar,'2026-03-03T01:00:00Z',prior),/incomplete/);
  const changed = fixture(); changed.data.dividList[0].dividA='2600'; changed.product.info.divideList[0].DIVID_A=2600;
  assert.throws(()=>prepare(changed,prior),/changed/);
  assert.equal(JSON.stringify(prior), saved);
});

test('bulletin parser verifies ticker-specific per-unit cash, and requires a complete list shape', () => {
  verifyKodexNotice('<table><tr><td>459580</td><td>KODEX CD금리액티브(합성) ETF</td><td>0.24</td><td>2,572</td></tr></table>',2572);
  assert.throws(()=>verifyKodexNotice('<tr><td>459581</td><td>다른ETF</td><td>2572</td></tr>',2572));
  assert.throws(()=>parseKodexNotices('<html>temporary error</html>'));
  assert.equal(parseKodexNotices(' \n').count,0);
  assert.equal(notice[0].sourceUrl,'https://www.samsungfund.com/etf/lounge/notice-view.do?no=123');
});

test('issuer client permits only reviewed public URLs and enforces response limits without credentials', async () => {
  const calls=[];
  const client=createKodexClient({request:async (url,options)=>{calls.push({url,options}); return new Response('{}');},wait:async()=>{},now:()=>0});
  await client('https://www.samsungfund.com/api/v1/kodex/divid-info.do?id=2ETFJ8');
  assert.equal(calls.length,1); assert.equal(calls[0].options.redirect,'error');
  assert.equal(new URL(calls[0].url).searchParams.has('api_key'),false);
  await assert.rejects(()=>client('https://www.samsungfund.com/api/v1/kodex/divid-info.do?id=2ETFJ8&key=secret'),/rejected/);
  await assert.rejects(()=>client('https://example.com/api/v1/kodex/divid-info.do?id=2ETFJ8'),/rejected/);
  const huge=createKodexClient({request:async()=>new Response('{}',{headers:{'content-length':String(3*1024*1024)}}),wait:async()=>{}});
  await assert.rejects(()=>huge('https://www.samsungfund.com/api/v1/kodex/divid-info.do?id=2ETFJ8'),/size/);
});

test('collector joins two issuer views and each announcement; raw fetch time survives cached reuse', async () => {
  const f=fixture(), fetchTime=Date.parse('2026-02-04T00:00:00Z'), calls=[];
  const source={get:async url=>{calls.push(url); let value;
    if(url.includes('divid-info')) value=JSON.stringify(f.data);
    else if(url.includes('/product/')) value=JSON.stringify(f.product);
    else if(url.includes('notice-ajax')) value=noticeHtml;
    else value='<tr><td>459580</td><td>KODEX CD금리액티브(합성)</td><td>0.24</td><td>2,572</td></tr>';
    return {text:value,fetchedAt:fetchTime,cached:true};}};
  const result=await collectKodexDividends(source,null,()=> '2026-02-04T01:00:00Z');
  assert.equal(result.events.length,1); assert.equal(calls.length,4);
  assert.equal(result.sourceCheckedAt,'2026-02-04T00:00:00.000Z');
  assert.notEqual(result.checkedAt,result.sourceCheckedAt);
});
