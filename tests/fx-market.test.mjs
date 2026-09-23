import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescript } from './load-typescript.mjs';
const fx = loadTypescript('src/features/market/fx.ts');
const { createRequestCache } = loadTypescript('src/shared/async/request-cache.ts');
class MarketError extends Error { constructor(message, status = 502) { super(message); this.status = status; } }
const validDate = date => /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(date).toISOString().slice(0, 10) === date;
const friday = Date.parse('2026-09-18T21:00:00Z');
const monday = Date.parse('2026-09-20T15:00:00Z');
const row = (at, price) => ({ date: new Date(at), close: price });
function chart(symbol, quotes, meta = {}) {
  return { meta: { symbol, currency: fx.fxPair(symbol)?.quote, instrumentType: 'CURRENCY', dataGranularity: '1m', ...meta }, quotes };
}
function server(chartFn, extras = {}) {
  const calls = [];
  const marketModule = loadTypescript('src/features/market/server/fx-market.ts', {
    './provider': { MarketError, providerRequests: createRequestCache({ concurrency: 4 }),
      yahoo: { chart: async (symbol, options, request) => { calls.push({ symbol, options, signal: request.fetchOptions.signal }); return chartFn(symbol, options); },
        quote: extras.quote ?? (async () => { throw new Error('quote down'); }) } },
    './fx-reference': { fetchEcbBaseline: extras.reference ?? (async () => null) },
  });
  return { ...marketModule, calls };
}

test('Monday midnight selects the preceding Friday NY close with DST and year boundaries', () => {
  for (const [at, close] of [
    ['2026-09-20T15:00:00Z', '2026-09-18T21:00:00Z'],
    ['2026-01-04T15:00:00Z', '2026-01-02T22:00:00Z'],
    ['2026-03-08T15:00:00Z', '2026-03-06T22:00:00Z'],
    ['2026-11-01T15:00:00Z', '2026-10-30T21:00:00Z'],
  ]) {
    const result = fx.fxCutoff(Date.parse(at));
    assert.equal(result.closed, true); assert.equal(new Date(result.at).toISOString(), new Date(close).toISOString());
  }
  for (const at of ['2026-09-18T20:59:00Z', '2026-09-20T21:00:00Z', '2026-09-21T01:00:00Z'])
    assert.equal(fx.fxCutoff(Date.parse(at)).closed, false);
  assert.equal(fx.fxCutoff(friday).closed, true);
});

test('only the same directed pair accepts a USD provider alias', () => {
  assert.equal(fx.sameFxPair('USDKRW=X', 'KRW=X'), true);
  assert.equal(fx.sameFxPair('USDCNY=X', 'CNY=X'), true);
  for (const pair of ['KRWUSD=X', 'CNYKRW=X', 'CNHKRW=X', 'AAPL']) assert.equal(fx.sameFxPair('USDKRW=X', pair), false);
  assert.equal(fx.sameFxPair('CNYKRW=X', 'CNHKRW=X'), false);
});

test('Monday baseline accepts the provider alias, selects Friday completed bar and excludes later data', async () => {
  const market = server(() => chart('KRW=X', [row(friday - 120000, 1385), row(friday - 60000, 1386), row(friday, 9999), row(monday, 8888)]));
  const result = await market.fetchFxBaseline('USDKRW=X', '2026-09-21');
  assert.equal(result.price, 1386); assert.equal(result.symbol, 'USDKRW=X'); assert.equal(result.marketClosed, true);
  assert.equal(result.sourceEndAt, '2026-09-18T21:00:00.000Z'); assert.equal(result.fx.method, 'direct');
  assert.equal(market.calls[0].options.period2.getTime(), friday);
  assert.equal(market.calls[0].options.period1.getTime(), friday - 300000);
});

test('direct data wins, sparse minutes are bounded and malformed metadata never passes', async () => {
  const good = server(s => chart(s, [row(friday - 300000, 10), row(friday - 60000, null)]));
  assert.equal((await good.fetchFxMinute('JPYKRW=X', monday)).price, 10); assert.equal(good.calls.length, 1);
  for (const meta of [{ currency: 'USD' }, { symbol: 'KRWUSD=X' }, { instrumentType: 'EQUITY' }, { dataGranularity: '1d' }]) {
    const bad = server(s => chart(s, [row(friday - 60000, 10)], meta));
    assert.equal(await bad.fetchFxMinute('USDKRW=X', monday), null);
  }
  const older = await server(s => chart(s, [row(friday - 360000, 10)])).fetchFxMinute('USDKRW=X', monday);
  assert.equal(older.price, 10); assert.equal(older.fx.carried, true); assert.equal(older.closed, null);
  for (const values of [[row(friday, 10)], [row(friday - 59999, 10)], [row(friday - 60000, 0)], [row(friday - 60000, Infinity)]]) {
    assert.equal(await server(s => chart(s, values)).fetchFxMinute('USDKRW=X', monday), null);
  }
});

test('USD cross uses a common real minute, correct division and original evidence', async () => {
  const market = server(s => chart(s, s === 'CNYKRW=X' ? [] : s === 'CNY=X'
    ? [row(friday - 60000, 7), row(friday - 120000, 6)] : [row(friday - 120000, 1200)]));
  const result = await market.fetchFxMinute('CNYKRW=X', monday);
  assert.equal(result.price, 200); assert.equal(result.at, friday - 120000); assert.equal(result.fx.method, 'usd-cross');
  assert.equal(result.fx.components.length, 2); assert.equal(result.fx.components[0].sourceAt, result.fx.components[1].sourceAt);
  const mismatch = server(s => chart(s, s === 'CNYKRW=X' ? [] : [row(friday - (s === 'CNY=X' ? 60000 : 120000), 7)]));
  assert.equal(await mismatch.fetchFxMinute('CNYKRW=X', monday), null);
});

test('EUR/USD orientation is inverted once, not multiplied or inverted twice', async () => {
  const market = server(s => chart(s, s === 'EURKRW=X' ? [] : [row(friday - 60000, s === 'EURUSD=X' ? 1.2 : 1400)]));
  assert.equal((await market.fetchFxMinute('EURKRW=X', monday)).price, 1680);
});

test('leaf requests deduplicate without nested-queue deadlock; cancellation does not trigger fallback', async () => {
  const market = server(s => chart(s, s === 'CNYKRW=X' ? [] : [row(friday - 60000, s === 'CNY=X' ? 7 : 1400)]));
  const results = await Promise.all(Array.from({ length: 8 }, () => market.fetchFxMinute('CNYKRW=X', monday)));
  assert.ok(results.every(r => r.price === 200)); assert.equal(market.calls.length, 3);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(market.fetchFxBaseline('USDKRW=X', '2026-09-21', controller.signal), { name: 'AbortError' });
  assert.equal(market.calls.length, 3);
});

test('provider outage falls back to a reference and all-provider failure remains unavailable, never zero', async () => {
  const reference = { status: 'available', price: 200, precision: 'daily-reference' };
  const market = server(() => { throw new Error('down'); }, { reference: async () => reference });
  assert.equal(await market.fetchFxBaseline('CNYKRW=X', '2026-09-21'), reference);
  const down = server(() => { throw new Error('down'); }, { reference: async () => { throw new Error('down'); } });
  const result = await down.fetchFxBaseline('USDKRW=X', '2026-09-21');
  assert.equal(result.status, 'unavailable'); assert.equal(result.price, null);
});

test('current quote accepts canonical aliases, rejects future/stale data and recovers from timestamped chart', async () => {
  const now = Date.parse('2026-09-21T01:00:00Z');
  const quote = async () => ({ symbol: 'KRW=X', currency: 'KRW', regularMarketPrice: 1400, regularMarketTime: new Date(now - 60000) });
  const market = server(() => { throw new Error('unused'); }, { quote });
  assert.equal((await market.fetchFxQuote('USDKRW=X', undefined, now)).symbol, 'USDKRW=X'); assert.equal(market.calls.length, 0);
  for (const at of [now + 1000, now - 16 * 60000]) {
    const fallback = server(s => chart(s, [row(now - 60000, 1401)]), { quote: async () => ({ ...await quote(), regularMarketTime: new Date(at) }) });
    assert.equal((await fallback.fetchFxQuote('USDKRW=X', undefined, now)).price, 1401);
  }
});

const reference = loadTypescript('src/features/market/server/fx-reference.ts', { './provider': { MarketError, validDate } });
const xml = days => `<Envelope xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref"><Cube>${days.map(([date, cny = 7, krw = 1400]) => `<Cube time="${date}"><Cube currency="USD" rate="1.1"/><Cube currency="CNY" rate="${cny}"/><Cube currency="KRW" rate="${krw}"/></Cube>`).join('')}</Cube></Envelope>`;
test('reference fallback uses same dated EUR legs, preserves the reference date and rejects future or over-age days', () => {
  const days = reference.parseEcbReferences(xml([['2026-09-21', 8], ['2026-09-18']]));
  const result = reference.selectEcbBaseline('CNYKRW=X', '2026-09-21', days);
  assert.equal(result.price, 200); assert.equal(result.fx.referenceDate, '2026-09-18'); assert.equal(result.precision, 'daily-reference');
  assert.equal(result.source, 'ecb-reference'); assert.equal(result.sourceAt, null); assert.equal(result.sourceEndAt, null);
  assert.equal(reference.selectEcbBaseline('CNYKRW=X', '2026-10-01', days), null);
  assert.equal(reference.selectEcbBaseline('CNHKRW=X', '2026-09-21', days), null);
  assert.equal(reference.selectEcbBaseline('CNYKRW=X', '2026-09-18', reference.parseEcbReferences(xml([['2026-09-18']]))), null);
});
test('empty or foreign XML and invalid reference rates fail closed', () => {
  for (const invalid of ['', '<html>Error</html>', xml([]), xml([['2026-09-18', 0, 0]])]) assert.throws(() => reference.parseEcbReferences(invalid));
});

test('Friday data absence and early closing select the last completed real minute without asserting a holiday', async () => {
  for (const [date, last] of [
    ['2026-09-21', '2026-09-17T20:59:00Z'],
    ['2026-09-21', '2026-09-18T16:59:00Z'],
    ['2026-12-28', '2026-12-24T17:59:00Z'],
    ['2027-01-04', '2026-12-31T20:59:00Z'],
  ]) {
    const at = Date.parse(last), baseline = Date.parse(`${date}T00:00:00+09:00`);
    const market = server(s => chart(s, [row(at - 60000, 1390), row(at, 1400), row(baseline, 99999)]));
    const result = await market.fetchFxBaseline('USDKRW=X', date);
    assert.equal(result.price, 1400); assert.equal(result.sourceAt, new Date(at).toISOString());
    assert.equal(result.sourceEndAt, new Date(at + 60000).toISOString());
    assert.equal(result.fx.carried, true); assert.equal(result.marketClosed, null);
    assert.equal(market.calls.length, 2); assert.equal(market.calls[1].options.period1.getTime(), baseline - fx.FX_LOOKBACK);
    assert.ok(market.calls.every(call => call.options.period2.getTime() <= baseline));
  }
});

test('a long closure accepts up to seven days from the requested instant, not seven days from Friday', async () => {
  const oldest = monday - fx.FX_LOOKBACK;
  const market = server(s => chart(s, [row(oldest - 60000, 1), row(oldest, 1400)]));
  const valid = await market.fetchFxMinute('USDKRW=X', monday);
  assert.equal(valid.price, 1400); assert.equal(valid.at, oldest); assert.equal(valid.fx.carried, true);
  for (const at of [oldest - 60000, friday - fx.FX_LOOKBACK]) {
    const old = server(s => chart(s, [row(at, 1400)]));
    assert.equal(await old.fetchFxMinute('USDKRW=X', monday), null);
  }
  assert.equal(fx.usableFxQuote(oldest, monday), true);
  assert.equal(fx.usableFxQuote(oldest - 1, monday), false);
});

test('broad search chooses the newest observation across direct and same-minute USD cross paths', async () => {
  const thu = Date.parse('2026-09-17T20:59:00Z'), fri = Date.parse('2026-09-18T16:59:00Z');
  for (const directNewest of [false, true]) {
    const directTime = directNewest ? fri : thu, crossTime = directNewest ? thu : fri;
    const market = server(s => chart(s, s === 'CNYKRW=X' ? [row(directTime, 201)] : [row(crossTime, s === 'CNY=X' ? 7 : 1400)]));
    const result = await market.fetchFxMinute('CNYKRW=X', monday);
    assert.equal(result.at, fri); assert.equal(result.price, directNewest ? 201 : 200);
    assert.equal(result.fx.method, directNewest ? 'direct' : 'usd-cross');
    assert.equal(result.fx.carried, true); assert.equal(result.closed, null);
  }
  const sameMinute = server(s => chart(s, [row(fri, s === 'CNYKRW=X' ? 201 : s === 'CNY=X' ? 7 : 1400)]));
  assert.equal((await sameMinute.fetchFxMinute('CNYKRW=X', monday)).fx.method, 'direct');
});

test('broad crosses never combine different minutes, future samples, zero legs or CNY/CNH aliases', async () => {
  const old = Date.parse('2026-09-17T20:59:00Z');
  const different = server(s => chart(s, s === 'CNYKRW=X' ? [] : [row(old - (s === 'CNY=X' ? 60000 : 0), 7)]));
  assert.equal(await different.fetchFxMinute('CNYKRW=X', monday), null);
  const future = server(s => chart(s, s === 'CNYKRW=X' ? [] : [row(monday, 7)]));
  assert.equal(await future.fetchFxMinute('CNYKRW=X', monday), null);
  const zero = server(s => chart(s, s === 'CNYKRW=X' ? [] : [row(old, s === 'CNY=X' ? 0 : 1400)]));
  assert.equal(await zero.fetchFxMinute('CNYKRW=X', monday), null);
  const alias = server(s => chart(s === 'CNY=X' ? 'CNH=X' : s, s === 'CNYKRW=X' ? [] : [row(old, 7)]));
  assert.equal(await alias.fetchFxMinute('CNYKRW=X', monday), null);
});

test('market-open old quotes are valuation-only, while weekends and provider-confirmed closure allow dated observations', async () => {
  const now = Date.parse('2026-09-21T01:00:00Z'), old = Date.parse('2026-09-17T20:59:00Z');
  const quote = marketState => async () => ({ symbol: 'KRW=X', currency: 'KRW', regularMarketPrice: 1400,
    regularMarketTime: new Date(old), marketState });
  const open = server(s => chart(s, [row(old, 1400)]), { quote: quote('REGULAR') });
  const valuation = await open.fetchFxQuote('USDKRW=X', undefined, now);
  assert.equal(valuation.price, 1400); assert.equal(valuation.fx.valuationOnly, true);
  assert.equal(valuation.marketState, 'REGULAR');
  const closed = server(() => { throw new Error('unneeded'); }, { quote: quote('CLOSED') });
  const result = await closed.fetchFxQuote('USDKRW=X', undefined, now);
  assert.equal(result.price, 1400); assert.equal(result.marketState, 'CLOSED'); assert.equal(result.fx.carried, true);
  assert.equal(result.quotedAt, new Date(old).toISOString()); assert.equal(closed.calls.length, 2);
  const weekend = server(s => chart(s, [row(old, 1400)]));
  const retained = await weekend.fetchFxQuote('USDKRW=X', undefined, monday);
  assert.equal(retained.price, 1400); assert.equal(retained.marketState, 'CLOSED'); assert.equal(retained.fx.carried, true);
  assert.equal(retained.quotedAt, new Date(old + 60000).toISOString());
  assert.equal(fx.usableFxQuote(old, now, 'REGULAR'), false); assert.equal(fx.usableFxQuote(old, now, 'CLOSED'), true);
});

test('current quotes reject over-week, future and weekend-after-cutoff timestamps even when provider says CLOSED', async () => {
  const now = Date.parse('2026-09-21T01:00:00Z');
  for (const at of [now - fx.FX_LOOKBACK - 1, now + 1]) {
    const market = server(() => { throw new Error('no fallback'); }, { quote: async () => ({ symbol: 'KRW=X', currency: 'KRW',
      regularMarketPrice: 1400, regularMarketTime: new Date(at), marketState: 'CLOSED' }) });
    await assert.rejects(market.fetchFxQuote('USDKRW=X', undefined, now), { status: 503 });
  }
  assert.equal(fx.usableFxQuote(friday + 60000, monday, 'CLOSED'), false);
  assert.equal(fx.usableFxQuote(NaN, monday, 'CLOSED'), false);
});

test('broad requests deduplicate across callers, caller cancellation avoids fallback and failures are retryable', async () => {
  const old = Date.parse('2026-09-17T20:59:00Z');
  const market = server(s => chart(s, s === 'CNYKRW=X' ? [] : [row(old, s === 'CNY=X' ? 7 : 1400)]));
  const results = await Promise.all(Array.from({ length: 8 }, () => market.fetchFxMinute('CNYKRW=X', monday)));
  assert.ok(results.every(r => r.price === 200 && r.fx.carried));
  assert.equal(market.calls.length, 6);
  assert.equal(new Set(market.calls.map(c => `${c.symbol}:${c.options.period1.getTime()}`)).size, 6);
  let healthy = false;
  const retry = server(s => { if (!healthy) throw new Error('temporary outage'); return chart(s, [row(friday - 60000, 1400)]); });
  assert.equal(await retry.fetchFxMinute('USDKRW=X', monday), null); assert.equal(retry.calls.length, 2);
  healthy = true;
  assert.equal((await retry.fetchFxMinute('USDKRW=X', monday)).price, 1400); assert.equal(retry.calls.length, 3);
  let fallbackCalls = 0;
  const controller = new AbortController();
  const cancelled = server(() => { controller.abort(); throw controller.signal.reason; }, { reference: async () => { fallbackCalls++; return null; } });
  await assert.rejects(cancelled.fetchFxBaseline('USDKRW=X', '2026-09-21', controller.signal), { name: 'AbortError' });
  assert.equal(cancelled.calls.length, 1); assert.equal(fallbackCalls, 0);
});

test('a carried CLOSED quote is compared with the chart and the newest received observation wins', async () => {
  const now = Date.parse('2026-09-21T01:00:00Z'), old = Date.parse('2026-09-17T20:59:00Z');
  const newer = Date.parse('2026-09-18T16:59:00Z');
  const quote = async () => ({ symbol: 'KRW=X', currency: 'KRW', regularMarketPrice: 1400,
    regularMarketTime: new Date(old), marketState: 'CLOSED' });
  const market = server(s => chart(s, [row(newer, 1401)]), { quote });
  const result = await market.fetchFxQuote('USDKRW=X', undefined, now);
  assert.equal(result.price, 1401); assert.equal(result.quotedAt, new Date(newer + 60000).toISOString());
  assert.equal(result.marketState, 'CLOSED'); assert.equal(result.fx.carried, true); assert.equal(market.calls.length, 2);
  const olderChart = server(s => chart(s, [row(old - 60000, 1399)]), { quote });
  assert.equal((await olderChart.fetchFxQuote('USDKRW=X', undefined, now)).price, 1400);
});

test('the same completed minute retains the original quote decimal rather than float32 chart noise', async () => {
  const now = Date.parse('2026-09-21T01:00:00Z'), old = Date.parse('2026-09-17T20:59:00Z');
  const price = 1383.78;
  const market = server(s => chart(s, [row(old, Math.fround(price))]), { quote: async () => ({ symbol: 'KRW=X', currency: 'KRW',
    regularMarketPrice: price, regularMarketTime: new Date(old + 30000), marketState: 'CLOSED' }) });
  const result = await market.fetchFxQuote('USDKRW=X', undefined, now);
  assert.equal(result.price, price); assert.equal(result.source, 'yahoo-quote');
  assert.equal(result.quotedAt, new Date(old + 30000).toISOString()); assert.equal(market.calls.length, 2);
});

test('validated CLOSED metadata survives a missing quote price and enables the historical chart fallback', async () => {
  const now = Date.parse('2026-09-21T01:00:00Z'), old = Date.parse('2026-09-17T20:59:00Z');
  const newer = Date.parse('2026-09-18T16:59:00Z');
  const metadata = { symbol: 'KRW=X', currency: 'KRW', regularMarketPrice: undefined,
    regularMarketTime: new Date(old), marketState: 'CLOSED' };
  const market = server(s => chart(s, [row(newer, 1401)]), { quote: async () => metadata });
  const result = await market.fetchFxQuote('USDKRW=X', undefined, now);
  assert.equal(result.price, 1401); assert.equal(result.marketState, 'CLOSED'); assert.equal(result.fx.carried, true);
  assert.equal(result.quotedAt, new Date(newer + 60000).toISOString());
  for (const invalid of [{ symbol: 'USDCNY=X' }, { currency: 'USD' }, { regularMarketTime: new Date(now + 1) },
    { regularMarketTime: new Date(now - fx.FX_LOOKBACK - 1) }, { regularMarketTime: undefined }, { marketState: 'REGULAR' }]) {
    const bad = server(s => chart(s, [row(newer, 1401)]), { quote: async () => ({ ...metadata, ...invalid }) });
    const valuation = await bad.fetchFxQuote('USDKRW=X', undefined, now);
    assert.equal(valuation.price, 1401); assert.equal(valuation.marketState, 'REGULAR');
    assert.equal(valuation.fx.valuationOnly, true);
  }
});

test('a non-minute request never expands the seven-day lookback by rounding downward', async () => {
  const asOf = monday + 30000, boundary = asOf - fx.FX_LOOKBACK;
  const market = server(s => chart(s, [row(boundary - 30000, 1399), row(boundary + 30000, 1400)]));
  const result = await market.fetchFxMinute('USDKRW=X', asOf);
  assert.equal(result.at, boundary + 30000); assert.equal(result.price, 1400);
  assert.equal(market.calls[1].options.period1.getTime(), boundary + 30000);
});
