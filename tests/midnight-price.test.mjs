import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescript } from './load-typescript.mjs';

class MarketError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}
const providerStub = {
  MarketError,
  validSymbol: (symbol) => /^[A-Za-z0-9.^=_-]{1,40}$/.test(symbol),
  validDate: (date) => /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date,
};
const market = loadTypescript('src/features/market/server/midnight-price.ts', {
  './provider': providerStub,
});
const baselineDate = '2026-09-19';
const midnight = '2026-09-18T15:00:00.000Z';
const fetchedAt = '2026-09-19T02:00:00.000Z';
const row = (date, close) => ({ date: new Date(date), close });
const chart = (symbol, quotes, currency = 'USD', dataGranularity = '1m') => ({
  meta: { symbol, currency, dataGranularity, instrumentType: symbol.endsWith('=X') ? 'CURRENCY' : 'EQUITY' }, quotes,
});

test('KST midnight uses the completed 23:59 bar and excludes a future close appended by the provider', () => {
  const result = market.selectMidnightPrice('AAPL', baselineDate, chart('AAPL', [
    row('2026-09-18T14:58:00Z', 90), row('2026-09-18T14:59:00Z', 100),
    row(midnight, 200), row('2026-09-18T20:00:00Z', 300),
  ]), fetchedAt);
  assert.equal(result.status, 'available');
  assert.equal(result.price, 100);
  assert.equal(result.precision, 'minute');
  assert.equal(result.baselineAt, midnight);
  assert.equal(result.sourceAt, '2026-09-18T14:59:00.000Z');
  assert.equal(result.sourceEndAt, midnight);
  assert.equal(result.cutoffLagSeconds, 0);
  assert.equal(result.marketClosed, false);
});

test('a missing final minute, delayed bar, null and future-only prices never become a zero or nearby substitute', () => {
  for (const [quotes, reason] of [
    [[row('2026-09-18T14:58:00Z', 100)], 'stale-price'],
    [[row('2026-09-18T14:44:00Z', 100)], 'stale-price'],
    [[row('2026-09-18T14:59:00Z', null)], 'missing-price'],
    [[row(midnight, 100), row('2026-09-18T20:00:00Z', 200)], 'missing-price'],
  ]) {
    const result = market.selectMidnightPrice('AAPL', baselineDate, chart('AAPL', quotes), fetchedAt);
    assert.equal(result.status, 'unavailable');
    assert.equal(result.reason, reason);
    assert.equal(result.price, null);
    assert.equal(result.sourceAt, null);
  }
});

test('FX uses its own midnight rate and carries minute precision without guessing a closed session', () => {
  const result = market.selectMidnightPrice('USDKRW=X', baselineDate, chart('USDKRW=X', [
    row('2026-09-18T14:59:00Z', 1389.08),
  ], 'KRW'), fetchedAt);
  assert.equal(result.price, 1389.08);
  assert.equal(result.currency, 'KRW');
  assert.equal(result.precision, 'minute');
  assert.equal(result.marketClosed, null);
  const stale = market.selectMidnightPrice('USDKRW=X', '2026-09-20', chart('USDKRW=X', [
    row('2026-09-18T21:59:00Z', 1400),
  ], 'KRW'), fetchedAt);
  assert.equal(stale.status, 'unavailable');
});

test('sparse FX retains the latest completed real minute and explicitly reports its distance from midnight', () => {
  const result = market.selectMidnightPrice('HKDKRW=X', baselineDate, chart('HKDKRW=X', [
    row('2026-09-18T14:53:00Z', 176.45),
    row('2026-09-18T14:55:00Z', null),
    row('2026-09-18T14:58:00Z', 176.57),
    row('2026-09-18T14:59:00Z', null),
    row(midnight, 999), row('2026-09-18T22:19:00Z', 888),
  ], 'KRW'), fetchedAt);
  assert.equal(result.status, 'available');
  assert.equal(result.price, 176.57);
  assert.equal(result.precision, 'minute');
  assert.equal(result.sourceAt, '2026-09-18T14:58:00.000Z');
  assert.equal(result.sourceEndAt, '2026-09-18T14:59:00.000Z');
  assert.equal(result.cutoffLagSeconds, 60);
  assert.equal(result.marketClosed, null);
});

test('sparse FX is bounded to five minutes and requires both the currency metadata and FX symbol', () => {
  const boundary = market.selectMidnightPrice('HKDKRW=X', baselineDate, chart('HKDKRW=X', [
    row('2026-09-18T14:55:00Z', 176.57),
  ], 'KRW'), fetchedAt);
  assert.equal(boundary.status, 'available');
  assert.equal(boundary.cutoffLagSeconds, 240);
  const stale = market.selectMidnightPrice('HKDKRW=X', baselineDate, chart('HKDKRW=X', [
    row('2026-09-18T14:54:00Z', 176.57),
  ], 'KRW'), fetchedAt);
  assert.equal(stale.status, 'unavailable');
  assert.equal(stale.cutoffLagSeconds, null);
  const onlyNull = market.selectMidnightPrice('HKDKRW=X', baselineDate, chart('HKDKRW=X', [
    row('2026-09-18T14:59:00Z', null), row(midnight, 176.57),
  ], 'KRW'), fetchedAt);
  assert.equal(onlyNull.status, 'unavailable');
  for (const instrumentType of ['EQUITY', undefined]) {
    const notCurrency = chart('HKDKRW=X', [row('2026-09-18T14:58:00Z', 176.57)], 'KRW');
    notCurrency.meta.instrumentType = instrumentType;
    assert.equal(market.selectMidnightPrice('HKDKRW=X', baselineDate, notCurrency, fetchedAt).status, 'unavailable');
  }
  const notFx = chart('AAPL', [row('2026-09-18T14:58:00Z', 100)]);
  notFx.meta.instrumentType = 'CURRENCY';
  assert.equal(market.selectMidnightPrice('AAPL', baselineDate, notFx, fetchedAt).status, 'unavailable');
});

test('completed Korean session uses its daily close and verified 15:30 end, not incorrect provider session metadata', () => {
  const data = chart('005930.KS', [
    row('2026-09-17T00:00:00Z', 100),
    row('2026-09-18T00:00:00Z', 200),
    row('2026-09-21T00:00:00Z', 900),
  ], 'KRW', '1d');
  data.meta.currentTradingPeriod = { regular: { end: new Date('2026-09-18T06:00:00Z') } };
  const result = market.selectMidnightPrice('005930.KS', baselineDate, data, fetchedAt);
  assert.equal(result.price, 200);
  assert.equal(result.precision, 'session-close');
  assert.equal(result.marketClosed, true);
  assert.equal(result.sourceAt, '2026-09-18T00:00:00.000Z');
  assert.equal(result.sourceEndAt, '2026-09-18T06:30:00.000Z');
});

test('weekends, holidays and shortened US sessions preserve the last completed trading date', () => {
  const weekend = market.midnightPricePlan('005930.KS', Date.parse('2026-09-20T15:00:00Z'));
  assert.equal(weekend.kind, 'session-close');
  assert.equal(weekend.date, '2026-09-18');
  const holiday = market.midnightPricePlan('AAPL', Date.parse('2026-09-07T15:00:00Z'));
  assert.equal(holiday.kind, 'session-close');
  assert.equal(holiday.date, '2026-09-04');
  assert.equal(new Date(holiday.end).toISOString(), '2026-09-04T20:00:00.000Z');
  const shortened = market.midnightPricePlan('AAPL', Date.parse('2026-11-28T15:00:00Z'));
  assert.equal(shortened.date, '2026-11-27');
  assert.equal(new Date(shortened.end).toISOString(), '2026-11-27T18:00:00.000Z');
});

test('stale daily price, unknown special session and unverified calendar year fail closed', () => {
  const stale = market.selectMidnightPrice('005930.KS', baselineDate, chart('005930.KS', [
    row('2026-09-17T00:00:00Z', 100),
  ], 'KRW', '1d'), fetchedAt);
  assert.equal(stale.status, 'unavailable');
  assert.equal(stale.reason, 'stale-price');
  const special = market.midnightPricePlan('005930.KS', Date.parse('2026-11-19T15:00:00Z'));
  assert.equal(special.kind, 'unknown-session');
  const nextYear = market.selectMidnightPrice('005930.KS', '2027-01-06', chart('005930.KS', [
    row('2027-01-05T00:00:00Z', 100),
  ], 'KRW', '1d'), fetchedAt);
  assert.equal(nextYear.status, 'unavailable');
});

test('missing currency and unexpected time resolution are unavailable instead of guessed', () => {
  const quotes = [row('2026-09-18T14:59:00Z', 100)];
  const noCurrency = market.selectMidnightPrice('AAPL', baselineDate, chart('AAPL', quotes, ''), fetchedAt);
  assert.equal(noCurrency.reason, 'missing-currency');
  const widerBar = market.selectMidnightPrice('AAPL', baselineDate, chart('AAPL', quotes, 'USD', '5m'), fetchedAt);
  assert.equal(widerBar.reason, 'unsupported-resolution');
});

test('canonical symbol/date share a bounded request; unavailable data are retried and a new KST date gets a new key', async () => {
  const { createRequestCache } = loadTypescript('src/shared/async/request-cache.ts');
  const calls = [];
  let missing = true;
  const server = loadTypescript('src/features/market/server/midnight-price.ts', {
    './provider': {
      ...providerStub,
      providerRequests: createRequestCache({ concurrency: 4 }),
      yahoo: { chart: async (symbol, options, request) => {
        calls.push({ symbol, options, signal: request.fetchOptions.signal });
        return chart(symbol, missing ? [] : [row(new Date(options.period2.getTime() - 60000), 100)], symbol.endsWith('=X') ? 'KRW' : 'USD');
      } },
    },
  });
  const now = new Date(fetchedAt);
  const missingResult = await server.fetchMidnightBaseline('AAPL', baselineDate, undefined, now);
  assert.equal(missingResult.status, 'unavailable');
  missing = false;
  const results = await Promise.all([
    server.fetchMidnightBaseline(' aapl ', baselineDate, undefined, now),
    server.fetchMidnightBaseline('AAPL', baselineDate, undefined, now),
  ]);
  assert.equal(results[0].price, 100);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].symbol, 'AAPL');
  assert.equal(calls[1].options.interval, '1m');
  assert.equal(calls[1].options.includePrePost, false);
  assert.equal(calls[1].options.period2.toISOString(), midnight);
  assert.equal(calls[1].options.period2 - calls[1].options.period1, 5 * 60000);
  assert.equal(calls[1].signal.aborted, false);
  await server.fetchMidnightBaseline('USDKRW=X', '2026-09-20', undefined, new Date('2026-09-20T02:00:00Z'));
  assert.equal(calls.length, 3);
  await assert.rejects(server.fetchMidnightBaseline('BAD/SYMBOL', baselineDate, undefined, now), { status: 400 });
  await assert.rejects(server.fetchMidnightBaseline('AAPL', '2026-09-18', undefined, now), { status: 400 });
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(server.fetchMidnightBaseline('AAPL', baselineDate, aborted.signal, now), { name: 'AbortError' });
  assert.equal(calls.length, 3);
});

test('baseline route accepts public symbol/date only and forwards cancellation with no HTTP cache', async () => {
  const calls = [];
  const route = loadTypescript('src/app/api/baseline/[symbol]/route.ts', {
    'next/server': { NextResponse: { json: (data, options) => ({ data, ...options }) } },
    '@/features/market/server/http': { marketResponseError: (error) => ({ status: error.status }) },
    '@/features/market/server/midnight-price': { fetchMidnightBaseline: async (...args) => {
      calls.push(args); return { symbol: args[0], date: args[1], status: 'unavailable', price: null };
    } },
  });
  const controller = new AbortController();
  const response = await route.GET({
    nextUrl: new URL('https://example.test/api/baseline/AAPL?date=2026-09-19'),
    signal: controller.signal,
  }, { params: Promise.resolve({ symbol: 'AAPL' }) });
  assert.equal(response.data.date, baselineDate);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.equal(calls[0][2], controller.signal);
  assert.equal(calls[0].length, 4);
});
