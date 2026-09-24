import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { foreignIssuers, parseForeignDividends, ordinaryExDate } from '../src/features/dividends/foreign.ts';
import { collectForeignDividends, dividendCalendars, filingRows } from '../scripts/prepare-foreign-dividends.mjs';

const issuer = symbol => foreignIssuers.find(item => item.symbol === symbol);
const url = symbol => `https://www.sec.gov/Archives/edgar/data/${issuer(symbol).cik}/000123456726000001/ex991.htm`;
const calendars = await dividendCalendars();

test('US/HK rights use current exchange calendars and reject unknown calendar years', () => {
  assert.equal(ordinaryExDate('2026-09-07', 'US', calendars), '2026-09-04');
  assert.equal(ordinaryExDate('2026-06-11', 'US', calendars), '2026-06-11');
  assert.equal(ordinaryExDate('2026-06-11', 'HK', calendars), '2026-06-10');
  assert.throws(() => ordinaryExDate('2027-06-11', 'US', calendars), /calendar/);
  assert.throws(() => ordinaryExDate('2026-12-24', 'HK', calendars), /settlement/);
});

test('Alphabet common dividend cannot pick the adjacent preferred dividend amount or dates', () => {
  const statement = `In July 2026, the company's Board of Directors declared a quarterly cash dividend of $12.15 per share on each of our Series A and Series B mandatory convertible preferred stock (equivalent to approximately $0.60 per each of our Series A and Series B Depositary Shares) and a quarterly cash dividend of $0.22 per share on our Class A, Class B, and Class C stock. The mandatory convertible preferred stock dividend is payable on August 15, 2026 to stockholders of record for each of the company's Series A and Series B shares as of August 1, 2026, and the common stock dividend is payable on September 14, 2026 to stockholders of record for each of the company's Class A, Class B, and Class C shares as of September 7, 2026.`;
  const events = parseForeignDividends(statement, issuer('GOOGL'), url('GOOGL'), '2026-07-22');
  assert.equal(events.length, 1); assert.equal(events[0].amountPerShare, .22);
  assert.equal(events[0].recordDate, '2026-09-07'); assert.equal(events[0].paymentDate, '2026-09-14');
});

test('Apple future ordinary announcement is parsed without a fixed event allowlist', () => {
  const text = `Apple’s board of directors has declared a cash dividend of $0.28 per share of the Company’s common stock. The dividend is payable on November 12, 2026, to shareholders of record as of the close of business on November 9, 2026.`;
  const events = parseForeignDividends(text, issuer('AAPL'), url('AAPL'), '2026-10-29');
  assert.equal(events[0].amountPerShare, .28); assert.equal(events[0].recordDate, '2026-11-09');
  assert.throws(() => parseForeignDividends(text, issuer('AAPL'), url('BAC'), '2026-10-29'), /source/);
});

test('Alibaba ADS and HK ordinary share keep different amounts, payment dates, and units', () => {
  const text = `As we announced on May 13, 2026, Alibaba Group declared an annual regular cash dividend for fiscal year 2026 in the amount of US$0.13125 per ordinary share or US$1.05 per ADS, payable in U.S. dollars. Record Date The dividend is payable as of the close of business on June 11, 2026, Hong Kong Time and New York Time, respectively. The payment date is expected to be on or around July 6, 2026 for holders of ordinary shares and on or around July 13, 2026 for holders of ADSs.`;
  const events = parseForeignDividends(text, issuer('BABA'), url('BABA'), '2026-05-28');
  assert.deepEqual(events.map(e => [e.symbol, e.amountPerShare, e.paymentDate]), [['BABA', 1.05, '2026-07-13'], ['9988.HK', .13125, '2026-07-06']]);
  assert.throws(() => parseForeignDividends(text.replace('$1.05', '$2.00'), issuer('BABA'), url('BABA'), '2026-05-28'), /ratio/);
});

test('complete BAC declaration tables are parsed, not preferred rows or dividend totals', () => {
  const text = `<table><tr><td>Declaration Date</td><td>Record Date</td><td>Payment Date</td><td>Dividend Per Share</td></tr><tr><td>April 23, 2026</td><td>June 5, 2026</td><td>June 26, 2026</td><td>$0.28</td></tr></table><p>Preferred cash dividends $1.75</p>`;
  const events = parseForeignDividends(text, issuer('BAC'), url('BAC'), '2026-05-01');
  assert.equal(events.length, 1); assert.equal(events[0].amountPerShare, .28);
  assert.equal(events[0].declaredDate, '2026-04-23');
  assert.equal(events[0].declarationDateBasis, 'issuer-date');
});

test('failure and changed facts retain the previous public snapshot with failed coverage', async () => {
  const old = { id: 'AAPL:2026-08-10', symbol: 'AAPL', amountPerShare: .27, paymentDate: '2026-08-13', recordDate: '2026-08-10' };
  const previous = { checkedAt: '2026-09-23T00:00:00Z', events: [old], symbols: [{ symbol: 'AAPL', checkedAt: '2026-09-23T00:00:00Z' }] };
  const result = await collectForeignDividends({ source: { get: async () => { throw Error('SEC HTTP 429'); } }, previous, calendars, now: '2026-09-24T00:00:00Z', issuers: [issuer('AAPL')] });
  assert.deepEqual(result.events, [old]); assert.equal(result.symbols[0].status, 'failed');
  assert.equal(result.symbols[0].checkedAt, previous.symbols[0].checkedAt);
  assert.throws(() => filingRows({ cik: 1, tickers: ['AAPL'] }, issuer('AAPL'), '2026-09-24'), /mapping/);
});

test('actual prepared source coverage distinguishes unpaid companies from missing source events', () => {
  const feed = JSON.parse(readFileSync('src/features/dividends/prepared-foreign.json', 'utf8'));
  assert.ok(feed.events.some(e => e.symbol === 'AAPL'));
  for (const symbol of ['GOOGL', 'SBUX', 'BAC', 'OXY', 'BABA', '9988.HK']) assert.ok(feed.events.some(e => e.symbol === symbol), symbol);
  assert.equal(feed.symbols.find(c => c.symbol === 'OXY').status, 'partial');
  for (const symbol of ['NU', 'GRAB', 'SOC']) assert.equal(feed.symbols.find(c => c.symbol === symbol).status, 'no-announcement');
  assert.equal(feed.events.find(e => e.symbol === 'GOOGL' && e.recordDate === '2026-09-07').exDate, '2026-09-04');
});
