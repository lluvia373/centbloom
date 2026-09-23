import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescript } from './load-typescript.mjs';

const fx = loadTypescript('src/features/market/fx.ts');
const { createRequestCache } = loadTypescript('src/shared/async/request-cache.ts');
const now = Date.parse('2026-09-22T16:52:50Z');
const minute = 60_000;
const row = (at, close) => ({ date: new Date(at), close });
const rawChart = (symbol, quotes, meta = {}) => ({
  meta: { symbol, currency: fx.fxPair(symbol)?.quote, instrumentType: 'CURRENCY', dataGranularity: '1m', ...meta }, quotes,
});
const rawQuote = (at, price = 202.863, extra = {}) => ({
  symbol: 'CNYKRW=X', currency: 'KRW', regularMarketPrice: price,
  regularMarketTime: new Date(at), marketState: 'REGULAR', ...extra,
});
class MarketError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}
function server(quote, chart = symbol => rawChart(symbol, [])) {
  const calls = [];
  const market = loadTypescript('src/features/market/server/fx-market.ts', {
    './provider': { MarketError, providerRequests: createRequestCache({ concurrency: 4 }), yahoo: {
      quote: async () => { calls.push('quote'); if (quote instanceof Error) throw quote; return quote; },
      chart: async (symbol, options, request) => { calls.push({ symbol, options, signal: request.fetchOptions.signal }); return chart(symbol, options); },
    } },
  });
  return { ...market, calls };
}

test('the newer confirmed direct rate remains valuation-only instead of being replaced by an older completed chart', async () => {
  const at = Date.parse('2026-09-22T16:34:08Z');
  const market = server(rawQuote(at), symbol => rawChart(symbol,
    symbol === 'CNYKRW=X' ? [row('2026-09-22T16:29Z', 202.845)] : []));
  const result = await market.fetchFxQuote('CNYKRW=X', undefined, now);
  assert.equal(result.price, 202.863);
  assert.equal(result.quotedAt, '2026-09-22T16:34:08.000Z');
  assert.equal(result.fetchedAt, new Date(now).toISOString());
  assert.equal(result.fx.valuationOnly, true);
  assert.equal(result.fx.carried, true);
  assert.equal(result.fx.components[0].sourceAt, result.quotedAt);
  assert.equal(result.marketState, 'REGULAR');
  assert.equal(result.source, 'yahoo-quote');
  assert.equal(fx.usableFxQuote(at, now, result.marketState), false);
  assert.equal(fx.usableValuationFxQuote(at, now), true);
});

test('a fresh completed source supersedes a stale direct rate and is not marked valuation-only', async () => {
  const market = server(rawQuote(now - 30 * minute), symbol => rawChart(symbol,
    symbol === 'CNYKRW=X' ? [row('2026-09-22T16:51Z', 203)] : []));
  const result = await market.fetchFxQuote('CNYKRW=X', undefined, now);
  assert.equal(result.price, 203);
  assert.equal(result.quotedAt, '2026-09-22T16:52:00.000Z');
  assert.equal(result.fx.valuationOnly, undefined);
  assert.equal(fx.usableFxQuote(Date.parse(result.quotedAt), now, result.marketState), true);
});

test('newer completed stale observations beat older direct quotes, with genuine source and completion times', async () => {
  const market = server(rawQuote(now - 2 * 60 * minute), symbol => rawChart(symbol,
    symbol === 'CNYKRW=X' ? [row('2026-09-22T16:29Z', 202.845)] : []));
  const result = await market.fetchFxQuote('CNYKRW=X', undefined, now);
  assert.equal(result.price, 202.845);
  assert.equal(result.quotedAt, '2026-09-22T16:30:00.000Z');
  assert.equal(result.fx.components[0].sourceAt, '2026-09-22T16:29:00.000Z');
  assert.equal(result.fx.valuationOnly, true);
  assert.equal(result.marketState, 'REGULAR');
});

test('a valid last direct quote survives chart-source failure without claiming a new observation', async () => {
  const at = now - 20 * minute;
  const market = server(rawQuote(at), () => { throw new Error('chart unavailable'); });
  const result = await market.fetchFxQuote('CNYKRW=X', undefined, now);
  assert.equal(result.price, 202.863);
  assert.equal(result.quotedAt, new Date(at).toISOString());
  assert.equal(result.fx.valuationOnly, true);
  assert.equal(result.marketState, 'REGULAR');
});

test('fallback cross-rates require the same observed minute and never substitute CNH for CNY', async () => {
  const at = Date.parse('2026-09-22T16:04Z');
  const market = server(new Error('quote unavailable'), symbol => rawChart(symbol,
    symbol === 'CNYKRW=X' ? [] : [row(at, symbol === 'CNY=X' ? 7 : 1400)]));
  const result = await market.fetchFxQuote('CNYKRW=X', undefined, now);
  assert.equal(result.price, 200);
  assert.equal(result.fx.method, 'usd-cross');
  assert.equal(result.fx.valuationOnly, true);
  assert.equal(result.fx.components[0].sourceAt, result.fx.components[1].sourceAt);
  assert.equal(result.quotedAt, '2026-09-22T16:05:00.000Z');
  for (const incorrect of ['different-minute', 'offshore-CNH']) {
    const bad = server(new Error('quote unavailable'), symbol => rawChart(
      incorrect === 'offshore-CNH' && symbol === 'CNY=X' ? 'CNH=X' : symbol,
      symbol === 'CNYKRW=X' ? [] : [row(at - (incorrect === 'different-minute' && symbol === 'CNY=X' ? minute : 0), 7)]));
    await assert.rejects(bad.fetchFxQuote('CNYKRW=X', undefined, now), { status: 503 });
  }
});

test('invalid quote metadata, nonpositive rates, future values and values beyond seven days never become valuation fallbacks', async () => {
  for (const extra of [
    { symbol: 'CNHKRW=X' }, { currency: 'USD' }, { regularMarketPrice: 0 },
    { regularMarketPrice: NaN }, { regularMarketTime: new Date(now + 1) },
    { regularMarketTime: new Date(now - fx.FX_LOOKBACK - 1) }, { regularMarketTime: undefined },
  ]) {
    const market = server(rawQuote(now - 20 * minute, 200, extra));
    await assert.rejects(market.fetchFxQuote('CNYKRW=X', undefined, now), { status: 503 });
  }
  const oldest = server(rawQuote(now - fx.FX_LOOKBACK));
  assert.equal((await oldest.fetchFxQuote('CNYKRW=X', undefined, now)).fx.valuationOnly, true);
});

test('shared valuation eligibility expires at seven days and retains the strict closed-weekend cutoff', () => {
  assert.equal(fx.usableValuationFxQuote(now - fx.FX_LOOKBACK, now), true);
  assert.equal(fx.usableValuationFxQuote(now - fx.FX_LOOKBACK - 1, now), false);
  assert.equal(fx.usableValuationFxQuote(now + 1, now), false);
  assert.equal(fx.usableValuationFxQuote(NaN, now), false);
  assert.equal(fx.usableValuationFxQuote(now, NaN), false);
  const weekend = Date.parse('2026-09-20T15:00Z');
  const friday = Date.parse('2026-09-18T21:00Z');
  assert.equal(fx.usableValuationFxQuote(friday, weekend), true);
  assert.equal(fx.usableValuationFxQuote(friday + 1, weekend), false);
});

test('fresh quotes retain their strict status and cancellation does not return a valuation fallback', async () => {
  const fresh = server(rawQuote(now - minute));
  const result = await fresh.fetchFxQuote('CNYKRW=X', undefined, now);
  assert.equal(result.fx?.valuationOnly, undefined);
  assert.deepEqual(fresh.calls, ['quote']);
  const abort = new AbortController(); abort.abort();
  const cancelled = server(rawQuote(now - 20 * minute));
  await assert.rejects(cancelled.fetchFxQuote('CNYKRW=X', abort.signal, now), { name: 'AbortError' });
  assert.equal(cancelled.calls.length, 0);
});
