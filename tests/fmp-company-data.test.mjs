import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFmpClient, normalizeFmp } from '../src/features/market/server/fmp.ts';
import { companyDatasets, companyCoverage, mergeCompanyObservation } from '../src/features/market/company-data.ts';
import { prepareCompanyData, parseCompanyArgs } from '../scripts/prepare-company-data.mjs';

const now = () => Date.parse('2026-09-24T10:00:00Z'), at = new Date(now()).toISOString();
const quote = { symbol: 'AAPL', price: 250, timestamp: now() / 1000, change: 2, changePercentage: .8 };
const dividend = { symbol: 'AAPL', date: '2026-08-10', dividend: .27, adjDividend: .27, paymentDate: '2026-08-13', recordDate: null, declarationDate: null };
const observation = (rows, attemptedAt = at) => ({ status: 'received', rows, attemptedAt, receivedAt: attemptedAt, completeness: 'unverified', issue: null });

test('unconfigured, missing-key and budget exhaustion make zero network requests', async () => {
  let calls = 0;
  for (const [enabled, apiKey, budget, expected] of [[false, 'test', true, 'disabled'], [true, '', true, 'missing-key'], [true, 'test', false, 'request-budget']]) {
    const client = createFmpClient({ enabled, apiKey, now, reserveRequest: async () => budget, request: async () => { calls++; throw Error('not allowed'); } });
    assert.equal((await client('quote', 'AAPL')).issue, expected);
  }
  assert.equal(calls, 0);
});

test('fixed endpoint, no redirects, timestamps preserved and unknowns not manufactured', async () => {
  const client = createFmpClient({ enabled: true, apiKey: 'private-key', now, reserveRequest: async () => true, request: async (url, init) => {
    assert.equal(url.origin, 'https://financialmodelingprep.com'); assert.equal(url.pathname, '/stable/quote');
    assert.equal(init.redirect, 'error'); return Response.json([quote]);
  } });
  const result = await client('quote', 'AAPL');
  assert.equal(result.status, 'received'); assert.equal(result.rows[0].quotedAt, at); assert.equal(result.completeness, 'unverified');
  const div = normalizeFmp('dividends', 'AAPL', [dividend], at)[0];
  assert.equal(div.currency, null); assert.equal(div.declarationDate, null); assert.equal(div.amount, .27);
});

test('empty response does not prove no dividend or no earnings', async () => {
  const client = createFmpClient({ enabled: true, apiKey: 'test', now, reserveRequest: async () => true, request: async () => Response.json([]) });
  assert.equal((await client('dividends', 'AAPL')).status, 'empty-unverified');
});

test('dividends and earnings use the actual free account five-row allowance', async () => {
  const requested = [];
  const client = createFmpClient({ enabled: true, apiKey: 'test', now, reserveRequest: async () => true,
    request: async url => { requested.push(url.pathname); assert.equal(url.searchParams.get('limit'), '5'); return Response.json([]); } });
  await client('dividends', 'AAPL'); await client('earnings', 'AAPL');
  assert.deepEqual(requested, ['/stable/dividends', '/stable/earnings']);
});

test('latest-window refresh retains older history, but not gaps or ambiguous corrections', () => {
  const previous = observation(Array.from({ length: 8 }, (_, i) => ({ date: `2025-0${i + 1}-01`, amount: 1 })), '2026-09-23T10:00:00Z');
  const rows = previous.rows.slice(3).map(row => ({ ...row }));
  const next = { ...observation(rows), windowSize: 5 };
  const result = mergeCompanyObservation(previous, next, 'dividends');
  assert.equal(result.status, 'received'); assert.equal(result.rows.length, 8);
  assert.equal(mergeCompanyObservation(previous, { ...next, rows: rows.slice(1) }, 'dividends').status, 'failed');
  assert.equal(mergeCompanyObservation(previous, { ...next, rows: [{ ...rows[0], amount: 2 }, ...rows.slice(1)] }, 'dividends').status, 'failed');
});

test('wrong symbol, impossible dates, duplicates, bad prices and future actuals rejected', () => {
  for (const rows of [[{ ...quote, symbol: 'MSFT' }], [{ ...quote, price: 0 }], [{ ...quote, timestamp: now() / 1000 + 1000 }], [quote, quote]])
    assert.throws(() => normalizeFmp('quote', 'AAPL', rows, at));
  assert.throws(() => normalizeFmp('dividends', 'AAPL', [{ ...dividend, date: '2026-02-30' }], at));
  assert.throws(() => normalizeFmp('dividends', 'AAPL', [{ ...dividend, dividend: null }], at));
  assert.throws(() => normalizeFmp('earnings', 'AAPL', [{ symbol: 'AAPL', date: '2026-10-01', epsActual: 2 }], at));
  assert.throws(() => normalizeFmp('history', 'AAPL', [{ symbol: 'AAPL', date: '2026-09-20', open: 10, close: 20, low: 8, high: 9 }], at));
});

test('actual, estimate, zero and missing earnings remain distinct', () => {
  const rows = normalizeFmp('earnings', 'AAPL', [{ symbol: 'AAPL', date: '2026-08-01', epsActual: 0, epsEstimated: 1, revenueActual: null }], at);
  assert.equal(rows[0].epsActual, 0); assert.equal(rows[0].epsEstimated, 1); assert.equal(rows[0].revenueActual, null); assert.equal(rows[0].currency, null);
});

test('rate limit stops this run; provider denial/error text never leaks a key', async () => {
  let calls = 0;
  const client = createFmpClient({ enabled: true, apiKey: 'private-key', now, reserveRequest: async () => true, request: async () => { calls++; return new Response('private-key', { status: 429 }); } });
  const first = await client('quote', 'AAPL'), second = await client('quote', 'MSFT');
  assert.equal(first.issue, 'rate-limited'); assert.equal(second.issue, 'rate-limited'); assert.equal(calls, 1);
  assert.ok(!JSON.stringify(first).includes('private-key'));
  const bad = createFmpClient({ enabled: true, apiKey: 'private-key', now, reserveRequest: async () => true, request: async () => Response.json({ 'Error Message': 'private-key' }) });
  assert.equal((await bad('quote', 'AAPL')).issue, 'invalid-response');
});

test('failed, empty, truncated and conflicting refreshes retain dated last-good facts', () => {
  const old = observation([{ date: '2026-08-01', amount: 1 }], '2026-09-23T10:00:00Z');
  for (const next of [{ ...observation([]), status: 'failed' }, { ...observation([]), status: 'empty-unverified' }, observation([{ date: '2026-08-01', amount: 2 }]), observation([{ date: '2026-09-01', amount: 1 }])]) {
    const result = mergeCompanyObservation(old, next, 'dividends');
    assert.deepEqual(result.rows, old.rows); assert.equal(result.receivedAt, old.receivedAt); assert.notEqual(result.status, 'received');
  }
  const extended = mergeCompanyObservation(old, observation([...old.rows, { date: '2026-09-01', amount: 1 }]), 'dividends');
  assert.equal(extended.rows.length, 2); assert.equal(extended.status, 'received');
  assert.deepEqual(mergeCompanyObservation(extended, old, 'dividends'), extended);
});

test('earnings estimates may gain actual results; later corrections require review', () => {
  const previous = observation([{ date: '2026-08-01', epsActual: null, epsEstimated: 2 }], '2026-09-23T10:00:00Z');
  const actual = observation([{ date: '2026-08-01', epsActual: 3, epsEstimated: 2 }]);
  assert.equal(mergeCompanyObservation(previous, actual, 'earnings').status, 'received');
  assert.equal(mergeCompanyObservation(actual, observation([{ date: '2026-08-01', epsActual: 4, epsEstimated: 2 }]), 'earnings').status, 'failed');
});

test('collector persists a request budget, resumes and reports all-market limits honestly', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'centbloom-fmp-test-'));
  const options = { symbols: ['AAPL'], requests: 2, audit: false };
  const env = { FMP_API_KEY: 'test', FMP_EVALUATION_ENABLED: 'true' };
  const request = async url => Response.json(url.pathname.endsWith('profile') ? [{ symbol: 'AAPL', companyName: 'Test only', currency: 'USD', exchange: 'NASDAQ' }] : [quote]);
  const first = await prepareCompanyData(options, { directory, env, request, now });
  assert.equal(first.requestsUsed, 2); assert.equal(first.datasets.quote.received, 1); assert.equal(first.datasets.dividends.failed, 1);
  assert.equal(first.allStocksRealtimeDividendsEarningsDisplayed, false); assert.equal(first.realtimeVerified, false);
  await prepareCompanyData(options, { directory, env, request, now });
  assert.equal(JSON.parse(await readFile(join(directory, 'budget.json'))).used, 4);
  const audit = await prepareCompanyData({ ...options, symbols: ['AAPL', 'MSFT'], audit: true }, { directory, env, request: () => { throw Error('audit must not fetch'); }, now });
  assert.deepEqual(audit.missingSymbols, ['MSFT']); assert.equal(audit.requestsUsed, 0);
});

test('only explicit symbols accepted; no unsafe paths or unbounded sweep', () => {
  assert.throws(() => parseCompanyArgs([])); assert.throws(() => parseCompanyArgs(['--symbols=../a']));
  assert.throws(() => parseCompanyArgs(['--symbols=AAPL', '--requests=251']));
  assert.deepEqual(parseCompanyArgs(['--symbols=AAPL,MSFT,AAPL']).symbols, ['AAPL', 'MSFT']);
  const all = Object.fromEntries(companyDatasets.map(name => [name, observation([{ symbol: 'AAPL' }])]));
  assert.equal(companyCoverage([{ datasets: all }]).allStocksVerified, false);
});
