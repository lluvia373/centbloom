import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescript } from './load-typescript.mjs';

class MarketError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}
const baseProvider = {
  MarketError,
  validSymbol: symbol => /^[A-Za-z0-9.^=_-]{1,40}$/.test(symbol),
  validDate: day => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) &&
    new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day,
};
const load = (extra = {}) => loadTypescript('src/features/market/server/intraday.ts', {
  './provider': { ...baseProvider, ...extra },
});
const market = load();
const row = (at, close) => ({ date: new Date(at), close });
const chart = (symbol, quotes = [], interval = '1m', currency = 'USD') => ({
  meta: { symbol, currency, dataGranularity: interval, instrumentType: symbol.endsWith('=X') ? 'CURRENCY' : 'EQUITY' }, quotes,
});
const point = (series, at) => series.points.find(p => p.at === new Date(at).toISOString());

test('1d is today KST, includes only complete minute closes, and leaves missing minutes as gaps', () => {
  const series = market.selectIntradaySeries('AAPL', '1d', '2026-09-21', Date.parse('2026-09-21T14:03:20Z'), chart('AAPL', [
    row('2026-09-21T14:00:00Z', 100), row('2026-09-21T14:01:00Z', null),
    row('2026-09-21T14:02:17Z', 900), row('2026-09-21T14:03:00Z', 800), row('2026-09-21T14:04:00Z', 700),
  ]));
  assert.equal(series.startAt, '2026-09-20T15:00:00.000Z');
  assert.equal(series.endAt, '2026-09-21T14:03:00.000Z');
  assert.equal(point(series, '2026-09-21T14:00Z').close, null);
  assert.equal(point(series, '2026-09-21T14:01Z').close, 100);
  assert.equal(point(series, '2026-09-21T14:01Z').sourceAt, '2026-09-21T14:00:00.000Z');
  assert.equal(point(series, '2026-09-21T14:02Z').close, null);
  assert.equal(point(series, '2026-09-21T14:03Z').close, null);
  assert.ok(series.points.every((p, i) => i === 0 || Date.parse(p.at) - Date.parse(series.points[i - 1].at) === 60_000));
});

test('5d uses five calendar days and thirty-minute session-aligned complete bars, not a live marker', () => {
  const series = market.selectIntradaySeries('AAPL', '5d', '2026-09-21', Date.parse('2026-09-21T14:31:00Z'), chart('AAPL', [
    row('2026-09-21T13:30:00Z', 100), row('2026-09-21T14:00:00Z', 101),
    row('2026-09-21T14:15:00Z', 500), row('2026-09-21T14:30:00Z', 900),
  ], '30m'));
  assert.equal(series.startAt, '2026-09-16T15:00:00.000Z');
  assert.equal(series.interval, '30m');
  assert.equal(point(series, '2026-09-21T14:00Z').close, 100);
  assert.equal(point(series, '2026-09-21T14:30Z').close, 101);
  assert.ok(series.points.every((p, i) => i === 0 || Date.parse(p.at) - Date.parse(series.points[i - 1].at) === 30 * 60_000));
});

test('daily close cannot leak before the verified early close, including DST-adjusted local time', () => {
  const series = market.selectIntradaySeries('AAPL', '1d', '2026-11-28', Date.parse('2026-11-27T18:01Z'), chart('AAPL'),
    chart('AAPL', [row('2026-11-27T14:30Z', 200)], '1d'));
  assert.equal(point(series, '2026-11-27T17:59Z').close, null);
  assert.equal(point(series, '2026-11-27T18:00Z').close, 200);
  assert.equal(point(series, '2026-11-27T18:00Z').sourceAt, '2026-11-27T14:30:00.000Z');
});

test('a Friday holiday uses the actual prior session, never the holiday or current incomplete daily row', () => {
  const series = market.selectIntradaySeries('AAPL', '1d', '2026-07-06', Date.parse('2026-07-05T22:00Z'), chart('AAPL'),
    chart('AAPL', [row('2026-07-02T13:30Z', 120), row('2026-07-03T13:30Z', 900), row('2026-07-06T13:30Z', 800)], '1d'));
  assert.equal(series.points[0].close, 120);
  assert.equal(series.points.at(-1).close, 120);
});

test('metadata mismatch, unsupported resolution and invalid/current-day request are rejected', () => {
  const now = Date.parse('2026-09-21T14:00Z');
  for (const raw of [chart('MSFT'), chart('AAPL', [], '5m'), chart('AAPL', [], '1m', ''),
    { ...chart('USDKRW=X', [], '1m', 'KRW'), meta: { ...chart('USDKRW=X', [], '1m', 'KRW').meta, instrumentType: 'EQUITY' } }]) {
    assert.throws(() => market.selectIntradaySeries(raw.meta.symbol === 'USDKRW=X' ? 'USDKRW=X' : 'AAPL', '1d', '2026-09-21', now, raw), /종목·통화·시간/);
  }
  assert.throws(() => market.intradayWindow('1d', '2026-09-20', now), /오늘/);
  assert.throws(() => market.intradayWindow('1d', '2026-02-30', now), /오늘/);
  assert.throws(() => market.intradayWindow('1mo', '2026-09-21', now), /오늘/);
});

test('FX closes only carry a verified completed close; stale, incomplete and future quotes remain null', () => {
  const now = Date.parse('2026-09-20T03:00Z');
  const series = market.selectIntradaySeries('USDKRW=X', '1d', '2026-09-20', now, chart('KRW=X', [
    row('2026-09-18T20:59Z', 1300), row('2026-09-18T21:00:56Z', 9999), row('2026-09-20T04:00Z', 8888),
  ], '1m', 'KRW'));
  assert.equal(series.points[0].close, 1300);
  assert.equal(series.points.at(-1).close, 1300);
  const stale = market.selectIntradaySeries('USDKRW=X', '1d', '2026-09-20', now,
    chart('KRW=X', [row('2026-09-18T20:50Z', 1300)], '1m', 'KRW'));
  assert.ok(stale.points.every(p => p.close === null));
});

test('GBp currency remains GBp, lunch gaps and unverified special sessions are not invented', () => {
  const gb = market.selectIntradaySeries('VOD.L', '1d', '2026-09-21', Date.parse('2026-09-21T10:01Z'),
    chart('VOD.L', [row('2026-09-21T10:00Z', 120)], '1m', 'GBp'));
  assert.equal(gb.currency, 'GBp');
  assert.equal(point(gb, '2026-09-21T10:01Z').close, 120);
  const hk = market.selectIntradaySeries('0700.HK', '1d', '2026-09-21', Date.parse('2026-09-21T04:31Z'),
    chart('0700.HK', [row('2026-09-21T04:30Z', 500)], '1m', 'HKD'));
  assert.equal(point(hk, '2026-09-21T04:31Z').close, null);
  const kr = market.selectIntradaySeries('005930.KS', '1d', '2026-01-02', Date.parse('2026-01-02T01:00Z'),
    chart('005930.KS', [row('2026-01-02T00:59Z', 50000)], '1m', 'KRW'));
  assert.equal(point(kr, '2026-01-02T01:00Z').close, null);
});

test('FX cross fills only identical observed minutes and keeps both source request limits bounded', async () => {
  const calls = [];
  const server = load({
    providerRequests: { request: async (_key, run) => run(new AbortController().signal) },
    yahoo: { chart: async (symbol, options) => {
      calls.push({ symbol, options });
      if (symbol === 'HKDKRW=X') return chart(symbol, [], options.interval, 'KRW');
      if (symbol === 'HKD=X') return chart(symbol, [row('2026-09-21T14:00Z', 7.8), row('2026-09-21T14:01Z', 7.9)], options.interval, 'HKD');
      return chart(symbol, [row('2026-09-21T14:00Z', 1404)], options.interval, 'KRW');
    } },
  });
  const series = await server.fetchIntradayChart('HKDKRW=X', '1d', '2026-09-21', undefined, Date.parse('2026-09-21T14:02Z'));
  assert.equal(point(series, '2026-09-21T14:01Z').close, 180);
  assert.equal(point(series, '2026-09-21T14:02Z').close, null);
  assert.equal(calls.length, 3);
  for (const { options } of calls) {
    assert.equal(options.interval, '1m');
    assert.equal(options.includePrePost, false);
    assert.ok(options.period2 - options.period1 < 7 * 86_400_000);
  }
});

test('provider failure is an explicit failure, and cancellation is not converted to an empty success', async () => {
  const server = load({
    providerRequests: { request: async () => { throw new Error('provider unavailable'); } },
  });
  await assert.rejects(server.fetchIntradayChart('AAPL', '1d', '2026-09-21', undefined, Date.parse('2026-09-21T14:02Z')),
    error => error.status === 503);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(server.fetchIntradayChart('AAPL', '1d', '2026-09-21', abort.signal, Date.parse('2026-09-21T14:02Z')),
    error => error.name === 'AbortError');
});

test('chart route preserves the daily API and validates separate intraday query fields', async () => {
  const calls = [];
  const { GET } = loadTypescript('src/app/api/chart/[symbol]/route.ts', {
    '@/features/market/server/provider': baseProvider,
    '@/features/market/server/chart': { fetchChart: async (...args) => { calls.push(['daily', ...args]); return { points: [1], symbol: 'AAPL' }; } },
    '@/features/market/server/intraday': { fetchIntradayChart: async (...args) => { calls.push(['intraday', ...args]); return { points: [2] }; } },
    '@/features/market/server/http': { marketResponseError: error => ({ error: error.message, status: error.status }) },
    'next/server': { NextResponse: { json: (body, options) => ({ body, ...options }) } },
  });
  const request = query => ({ nextUrl: new URL(`http://localhost/api/chart/AAPL?${query}`), signal: new AbortController().signal });
  const params = { params: Promise.resolve({ symbol: 'AAPL' }) };
  assert.deepEqual((await GET(request('range=1mo'), params)).body, [1]);
  assert.deepEqual((await GET(request('intraday=1d&day=2026-09-21'), params)).body.points, [2]);
  assert.equal((await GET(request('intraday=1d&day=2026-09-21&range=1mo'), params)).status, 400);
  assert.equal((await GET(request('intraday=1h&day=2026-09-21'), params)).status, 400);
  assert.equal((await GET(request('intraday=1d'), params)).status, 400);
  assert.equal(calls.length, 2);
});
