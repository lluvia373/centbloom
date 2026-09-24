import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTypescript } from './load-typescript.mjs';
import { collectDividends } from '../scripts/prepare-dividends.mjs';

const { parseAppleDividend, prepareDividendSnapshot, reviewAppleDividend } = loadTypescript('src/features/dividends/sec.ts');
const feed = JSON.parse(readFileSync('src/features/dividends/prepared.json', 'utf8'));
const now = '2026-09-24T12:00:00.000Z';
const events = feed.events;
const statement = event => `Apple’s board of directors has declared a cash dividend of $${event.amountPerShare} per share of the Company’s common stock. The dividend is payable on ${english(event.paymentDate)}, to shareholders of record as of the close of business on ${english(event.recordDate)}.`;
const english = date => new Intl.DateTimeFormat('en-US', {month:'long', day:'numeric', year:'numeric', timeZone:'UTC'}).format(new Date(date));

test('prepared real SEC facts match the three independently reviewed 2026 announcements', () => {
  assert.deepEqual(events.map(e => [e.exDate,e.paymentDate,e.amountPerShare]), [
    ['2026-02-09','2026-02-12',0.26],['2026-05-11','2026-05-14',0.27],['2026-08-10','2026-08-13',0.27],
  ]);
  for (const event of events) {
    const parsed = parseAppleDividend(statement(event), event.sourceUrl, event.declaredDate);
    assert.equal(reviewAppleDividend(parsed).id, event.id);
  }
});

test('parser accepts observed increase wording and HTML entities but rejects ambiguous, missing and foreign sources', () => {
  const event = events[1];
  const html = `<p>${statement(event).replace('stock.', 'stock, an increase of 4 percent.').replaceAll('’','&#8217;')}</p>`;
  assert.equal(parseAppleDividend(html, event.sourceUrl,event.declaredDate).amountPerShare,0.27);
  for (const bad of ['',statement(event).repeat(2),statement(event).replace('$0.27','$0'),statement(event).replace('May 11','February 31')])
    assert.throws(() => parseAppleDividend(bad,event.sourceUrl,event.declaredDate));
  assert.throws(() => parseAppleDividend(statement(event),'https://example.com/filing.htm',event.declaredDate));
});

test('publication refuses partial, duplicate, corrected and older snapshots without mutating last good data', () => {
  const before = JSON.stringify(feed);
  assert.throws(() => prepareDividendSnapshot(events.slice(1), feed, now));
  assert.throws(() => prepareDividendSnapshot([...events,events[0]],feed,now));
  assert.throws(() => prepareDividendSnapshot(events.map((e,i) => i ? e : {...e,amountPerShare:0.99}),feed,now));
  assert.throws(() => prepareDividendSnapshot(events,feed,'2026-09-23T00:00:00.000Z'));
  assert.throws(() => prepareDividendSnapshot(events.map((e,i) => i ? e : {...e,sourceUrl:'https://example.com'}),feed,now));
  assert.equal(JSON.stringify(feed),before);
});

test('unknown future rights stay pending; cached source time is not replaced by the run time', () => {
  const candidate = {...events[2],id:'AAPL:2026-11-09',declaredDate:'2026-09-23',recordDate:'2026-11-09',paymentDate:'2026-11-12'};
  const result = prepareDividendSnapshot([...events,candidate],feed,now,'2026-09-23T12:00:00.000Z');
  assert.equal(result.events.length,3);assert.equal(result.pending.length,1);
  assert.equal(result.sourceCheckedAt,'2026-09-23T12:00:00.000Z');
  assert.throws(() => prepareDividendSnapshot(events,feed,now,'2026-09-25T00:00:00.000Z'));
});

function sourceFixture(failExhibit = false) {
  const calls = [];
  const rows = {form:[],filingDate:[],accessionNumber:[],primaryDocument:[],items:[]};
  for (const event of events) {
    rows.form.push('8-K');rows.filingDate.push(event.declaredDate);rows.items.push('2.02,9.01');
    const accession=event.sourceUrl.split('/').at(-2);
    rows.accessionNumber.push(`${accession.slice(0,10)}-${accession.slice(10,12)}-${accession.slice(12)}`);
    rows.primaryDocument.push(`aapl-${event.declaredDate.replaceAll('-','')}.htm`);
  }
  return {calls, async get(url) {
    calls.push(url);
    const event=events.find(e => url.includes(e.sourceUrl.split('/').at(-2)));
    if (failExhibit && url === events[1].sourceUrl) throw Error('SEC HTTP 429');
    const text=url.includes('/submissions/') ? JSON.stringify({cik:320193,tickers:['AAPL'],filings:{recent:rows}})
      : url === event.sourceUrl ? statement(event) : `<a href="${event.sourceUrl.split('/').at(-1)}">99.1</a>`;
    return {text,fetchedAt:Date.parse('2026-09-24T00:00:00.000Z'),cached:true};
  }};
}

test('collector maps real issuer to exhibits, reuses cached facts, and fails closed on upstream failure', async () => {
  const source=sourceFixture();
  const collected=await collectDividends({source,previous:feed,now});
  assert.equal(collected.events.length,3);assert.equal(source.calls.length,7);
  assert.equal(collected.sourceCheckedAt,'2026-09-24T00:00:00.000Z');
  await assert.rejects(collectDividends({source:sourceFixture(true),previous:feed,now}),/429/);
  await assert.rejects(collectDividends({source:{get:async()=>({text:'{"cik":1,"tickers":["AAPL"]}'})},now}),/mapping/);
});
