import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescript } from './load-typescript.mjs';

const day = '2026-09-23';
const fetchedAt = '2026-09-22T16:43:19.000Z';
const row = (at, close) => ({ date: new Date(at), close });
const chart = (symbol, quotes, currency = 'KRW') => ({
  meta: { symbol, currency, dataGranularity: '1d', instrumentType: 'EQUITY' }, quotes,
});
class MarketError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}
const provider = {
  MarketError,
  validSymbol: symbol => /^[A-Za-z0-9.^=_-]{1,40}$/.test(symbol),
  validDate: date => /^\d{4}-\d{2}-\d{2}$/.test(date),
};
const load = overrides => loadTypescript('src/features/market/server/midnight-price.ts', {
  './provider': { ...provider, ...overrides }, './fx-market': {},
});
const { selectMidnightPrice, midnightPricePlan } = load();

test('observed Samsung and SK Hynix closing-auction rows retain their real timestamps and become valid midnight baselines', () => {
  // Yahoo public chart responses observed 2026-09-22T16:43:19Z with includePrePost:false.
  for (const [symbol, at, price] of [
    ['005930.KS', '2026-09-22T06:30:15.000Z', 276500],
    ['000660.KS', '2026-09-22T06:30:11.000Z', 1840000],
  ]) {
    const raw = chart(symbol, [row(at, price)]);
    // Provider metadata refers to another trading day and must not define the session.
    raw.meta.currentTradingPeriod = { regular: { end: new Date('2026-09-23T06:00Z') } };
    const result = selectMidnightPrice(symbol, day, raw, fetchedAt);
    assert.equal(result.status, 'available');
    assert.equal(result.price, price);
    assert.equal(result.precision, 'session-close');
    assert.equal(result.sourceAt, at);
    assert.equal(result.sourceEndAt, at);
    assert.equal(result.baselineAt, '2026-09-22T15:00:00.000Z');
    assert.equal(result.cutoffLagSeconds, (Date.parse(result.baselineAt) - Date.parse(at)) / 1000);
  }
});

test('the official KRX 30-second boundary is inclusive and never admits later or off-date prices', () => {
  const atBoundary = selectMidnightPrice('005930.KS', day,
    chart('005930.KS', [row('2026-09-22T06:30:30Z', 100)]), fetchedAt);
  assert.equal(atBoundary.status, 'available');
  assert.equal(atBoundary.sourceEndAt, '2026-09-22T06:30:30.000Z');
  for (const at of [
    '2026-09-22T06:30:30.001Z', '2026-09-22T06:31:00Z',
    '2026-09-22T07:00:00Z', '2026-09-21T06:30:15Z', '2026-09-23T06:30:15Z',
  ]) {
    const result = selectMidnightPrice('005930.KS', day, chart('005930.KS', [row(at, 999)]), fetchedAt);
    assert.equal(result.status, 'unavailable', at);
    assert.equal(result.price, null, at);
  }
});

test('a completed daily label keeps the calendar close; unknown special sessions stay unavailable', () => {
  const result = selectMidnightPrice('005930.KS', day,
    chart('005930.KS', [row('2026-09-22T00:00Z', 100)]), fetchedAt);
  assert.equal(result.status, 'available');
  assert.equal(result.sourceAt, '2026-09-22T00:00:00.000Z');
  assert.equal(result.sourceEndAt, '2026-09-22T06:30:00.000Z');
  const special = selectMidnightPrice('005930.KS', '2026-11-20',
    chart('005930.KS', [row('2026-11-19T07:30:15Z', 999)]), fetchedAt);
  assert.equal(special.status, 'unavailable');
  assert.equal(special.reason, 'unknown-session');
});

test('Korean closing-auction allowance is not applied to US or Japanese sessions', () => {
  for (const [symbol, date, at, currency] of [
    ['7203.T', '2026-09-19', '2026-09-18T06:30:15Z', 'JPY'],
    ['AAPL', '2026-09-20', '2026-09-18T20:00:15Z', 'USD'],
  ]) {
    const result = selectMidnightPrice(symbol, date, chart(symbol, [row(at, 999)], currency), fetchedAt);
    assert.equal(result.status, 'unavailable', symbol);
    assert.equal(result.price, null, symbol);
  }
});

test('extra closing-auction seconds require matching Korean equity or ETF metadata', () => {
  for (const override of [
    { symbol: 'AAPL' }, { currency: 'USD' }, { instrumentType: 'CURRENCY' },
    { instrumentType: 'FUTURE' }, { instrumentType: undefined },
  ]) {
    const raw = chart('005930.KS', [row('2026-09-22T06:30:15Z', 999)]);
    Object.assign(raw.meta, override);
    const result = selectMidnightPrice('005930.KS', day, raw, fetchedAt);
    assert.equal(result.status, 'unavailable');
    assert.equal(result.price, null);
  }
  const etf = chart('069500.KS', [row('2026-09-22T06:30:15Z', 100)]);
  etf.meta.instrumentType = 'ETF';
  assert.equal(selectMidnightPrice('069500.KS', day, etf, fetchedAt).status, 'available');
});

test('a closing-auction window that crosses the baseline cannot publish a partial daily close', () => {
  const baselineAt = Date.parse('2026-09-22T15:00Z');
  const plan = { ...midnightPricePlan('005930.KS', baselineAt), end: baselineAt - 20_000 };
  const result = selectMidnightPrice('005930.KS', day,
    chart('005930.KS', [row('2026-09-22T14:59:41Z', 999)]), fetchedAt, plan);
  assert.equal(result.status, 'unavailable');
  assert.equal(result.price, null);
});

test('midnight server still queries the verified regular daily session and preserves its existing cache lifetime', async () => {
  const requests = [];
  const calls = [];
  const server = load({
    providerRequests: { request: async (key, run, options) => {
      requests.push({ key, options });
      return run(new AbortController().signal);
    } },
    yahoo: { chart: async (symbol, options) => {
      calls.push({ symbol, options });
      return chart(symbol, [row('2026-09-22T06:30:15Z', 276500)]);
    } },
  });
  const result = await server.fetchMidnightBaseline('005930.KS', day, undefined, new Date(fetchedAt));
  assert.equal(result.status, 'available');
  assert.equal(result.price, 276500);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.period1.toISOString(), '2026-09-21T15:00:00.000Z');
  assert.equal(calls[0].options.period2.toISOString(), '2026-09-22T15:00:00.000Z');
  assert.equal(calls[0].options.interval, '1d');
  assert.equal(calls[0].options.includePrePost, false);
  assert.equal(requests[0].options.ttlMs, 300_000);
});
