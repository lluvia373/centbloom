import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescript } from './load-typescript.mjs';

const { createBaselineCache } = loadTypescript('src/features/market/baseline-cache.ts');
const DATE = '2026-09-23';
const NOW = Date.parse(`${DATE}T12:00:00+09:00`);
const CUTOFF = Date.parse(`${DATE}T00:00:00+09:00`);
const iso = at => new Date(at).toISOString();
const baseline = (change = {}) => ({
  symbol: 'AAPL', date: DATE, baselineAt: iso(CUTOFF), currency: 'USD', price: 230,
  status: 'available', precision: 'minute', source: 'yahoo-chart',
  sourceAt: iso(CUTOFF - 60_000), sourceEndAt: iso(CUTOFF), cutoffLagSeconds: 0,
  marketClosed: false, fetchedAt: iso(NOW), ...change,
});
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const flush = () => new Promise(resolve => setImmediate(resolve));
const response = value => new Response(JSON.stringify(value), { status: 200 });

function client(t, fetcher, clock = { now: NOW }, timeoutMs) {
  const original = globalThis.fetch;
  globalThis.fetch = fetcher;
  t.after(() => { globalThis.fetch = original; });
  const overrides = {
    '@/features/market/baseline-cache': { createBaselineCache: () => createBaselineCache({ now: () => clock.now }) },
  };
  if (timeoutMs !== undefined) {
    const { createRequestCache } = loadTypescript('src/shared/async/request-cache.ts');
    overrides['@/shared/async/request-cache'] = { createRequestCache: () => {
      const requests = createRequestCache();
      return { ...requests, request: (key, loader, options) => requests.request(key, loader, { ...options, timeoutMs }) };
    } };
  }
  return loadTypescript('src/lib/stock-api.ts', overrides);
}

test('normal midnight baselines reuse one symbol/date until five minutes from fetchedAt, not from last read', () => {
  let now = NOW;
  const cache = createBaselineCache({ now: () => now });
  const value = baseline();
  cache.set('AAPL', DATE, value);
  assert.equal(cache.get('AAPL', DATE), value);
  assert.equal(cache.get('MSFT', DATE), undefined);
  now += 299_999;
  assert.equal(cache.get('AAPL', DATE), value);
  now++;
  assert.equal(cache.get('AAPL', DATE), undefined);
  cache.set('AAPL', DATE, value);
  assert.equal(cache.get('AAPL', DATE), undefined, 'an expired response cannot restart its TTL');
});

test('a server-cached response receives only the remaining correction window', () => {
  let now = NOW;
  const cache = createBaselineCache({ now: () => now });
  const value = baseline({ fetchedAt: iso(NOW - 240_000) });
  cache.set('AAPL', DATE, value);
  now += 59_999;
  assert.equal(cache.get('AAPL', DATE), value);
  now++;
  assert.equal(cache.get('AAPL', DATE), undefined);
  const corrected = baseline({ price: 231, fetchedAt: iso(now) });
  cache.set('AAPL', DATE, corrected);
  assert.equal(cache.get('AAPL', DATE), corrected);
});

test('missing, mismatched, invalid and future responses never enter reusable baseline storage', () => {
  const invalid = [null, baseline({ status: 'unavailable', price: null }),
    ...[{ price: 0 }, { price: -1 }, { price: NaN }, { currency: null }, { currency: ' ' },
      { symbol: 'MSFT' }, { date: '2026-09-24' }, { baselineAt: iso(CUTOFF + 1) },
      { fetchedAt: 'invalid' }, { fetchedAt: iso(NOW + 1) }, { fetchedAt: iso(CUTOFF - 1) },
      { sourceAt: null }, { sourceEndAt: null }, { sourceEndAt: iso(CUTOFF + 1) },
      { sourceAt: iso(CUTOFF + 1) }, { precision: null }, { source: 'unverified' }].map(baseline),
  ];
  for (const value of invalid) {
    const cache = createBaselineCache({ now: () => NOW });
    cache.set('AAPL', DATE, value);
    assert.equal(cache.get('AAPL', DATE), undefined);
  }
});

test('session closes and dated ECB references remain legitimate without invented minute timestamps', () => {
  const cache = createBaselineCache({ now: () => NOW });
  const close = baseline({ precision: 'session-close', marketClosed: true,
    sourceAt: iso(CUTOFF - 36_000_000), sourceEndAt: iso(CUTOFF - 30_600_000) });
  cache.set('AAPL', DATE, close);
  assert.equal(cache.get('AAPL', DATE), close);
  const fx = { method: 'ecb-reference', referenceDate: '2026-09-22',
    publishedAt: '2026-09-22T12:15:00Z', components: [
      { symbol: 'EUR/USD', price: 1.1, sourceAt: '2026-09-22' },
      { symbol: 'EUR/KRW', price: 1_540, sourceAt: '2026-09-22' },
    ] };
  const reference = baseline({ symbol: 'USDKRW=X', currency: 'KRW', price: 1_400,
    precision: 'daily-reference', source: 'ecb-reference', sourceAt: null, sourceEndAt: null,
    cutoffLagSeconds: null, marketClosed: null, fx });
  cache.set('USDKRW=X', DATE, reference);
  assert.equal(cache.get('USDKRW=X', DATE), reference);
  for (const change of [{ referenceDate: DATE }, { referenceDate: '2026-02-30' },
    { referenceDate: '2026-09-15' }, { publishedAt: iso(CUTOFF + 1) }, { publishedAt: 'invalid' }]) {
    const fresh = createBaselineCache({ now: () => NOW });
    fresh.set('USDKRW=X', DATE, { ...reference, fx: { ...fx, ...change } });
    assert.equal(fresh.get('USDKRW=X', DATE), undefined);
  }
});

test('KST rollover discards old entries and does not retain a late response for yesterday', () => {
  let now = CUTOFF + 86_400_000 - 1;
  const cache = createBaselineCache({ now: () => now });
  const value = baseline({ fetchedAt: iso(now) });
  cache.set('AAPL', DATE, value);
  assert.equal(cache.get('AAPL', DATE), value);
  now++;
  cache.set('AAPL', DATE, value);
  assert.equal(cache.get('AAPL', DATE), undefined);
  const next = baseline({ date: '2026-09-24', baselineAt: iso(now), fetchedAt: iso(now) });
  cache.set('AAPL', '2026-09-24', next);
  assert.equal(cache.get('AAPL', '2026-09-24'), next);
  assert.equal(cache.get('AAPL', DATE), undefined);
});

test('clock rollback removes a future cached fetch and older responses do not overwrite a correction', () => {
  let now = NOW;
  const cache = createBaselineCache({ now: () => now });
  const corrected = baseline({ price: 231 });
  cache.set('AAPL', DATE, corrected);
  cache.set('AAPL', DATE, baseline({ fetchedAt: iso(NOW - 1_000) }));
  assert.equal(cache.get('AAPL', DATE), corrected);
  now--;
  assert.equal(cache.get('AAPL', DATE), undefined);
  now = NOW;
  assert.equal(cache.get('AAPL', DATE), undefined);
});

test('baseline cache evicts the least recently used instrument at its storage bound', () => {
  const cache = createBaselineCache({ now: () => NOW, maxEntries: 2 });
  for (const symbol of ['AAPL', 'MSFT']) cache.set(symbol, DATE, baseline({ symbol }));
  assert.equal(cache.get('AAPL', DATE).symbol, 'AAPL');
  cache.set('GOOG', DATE, baseline({ symbol: 'GOOG' }));
  assert.equal(cache.get('MSFT', DATE), undefined);
  assert.equal(cache.get('AAPL', DATE).symbol, 'AAPL');
  assert.equal(cache.get('GOOG', DATE).symbol, 'GOOG');
});

test('client re-entry and holding combination changes reuse normal per-symbol baselines beyond one minute', async t => {
  const clock = { now: NOW }, urls = [];
  const { getMidnightBaseline } = client(t, async url => {
    urls.push(String(url));
    return response(baseline({ symbol: String(url).includes('MSFT') ? 'MSFT' : 'AAPL', fetchedAt: iso(clock.now) }));
  }, clock);
  assert.equal((await getMidnightBaseline(' aapl ', DATE)).price, 230);
  clock.now += 120_000;
  const values = await Promise.all(['MSFT', 'AAPL'].map(symbol => getMidnightBaseline(symbol, DATE)));
  assert.deepEqual(values.map(value => value.symbol), ['MSFT', 'AAPL']);
  await getMidnightBaseline('AAPL', DATE);
  assert.deepEqual(urls, [`/api/baseline/AAPL?date=${DATE}`, `/api/baseline/MSFT?date=${DATE}`]);
  clock.now = NOW + 300_000;
  await getMidnightBaseline('AAPL', DATE);
  assert.equal(urls.length, 3, 'the correction refresh resumes after expiry');
});

test('unavailable and failed baseline responses are fetched again, while successful recovery is reused', async t => {
  let calls = 0;
  const { getMidnightBaseline } = client(t, async () => {
    calls++;
    if (calls === 1) return response(baseline({ status: 'unavailable', price: null, reason: 'missing-price' }));
    if (calls === 2) return new Response(JSON.stringify({ error: '공급 조회 실패' }), { status: 503 });
    return response(baseline());
  });
  assert.equal((await getMidnightBaseline('AAPL', DATE)).status, 'unavailable');
  await assert.rejects(getMidnightBaseline('AAPL', DATE), error => error.cause === 503);
  assert.equal((await getMidnightBaseline('AAPL', DATE)).price, 230);
  await getMidnightBaseline('AAPL', DATE);
  assert.equal(calls, 3);
});

test('future or mismatched responses are not reused by the client cache', async t => {
  let calls = 0;
  const { getMidnightBaseline } = client(t, async () => {
    calls++;
    return response(calls === 1 ? baseline({ fetchedAt: iso(NOW + 1) })
      : calls === 2 ? baseline({ symbol: 'MSFT' }) : baseline());
  });
  await getMidnightBaseline('AAPL', DATE);
  await getMidnightBaseline('AAPL', DATE);
  await getMidnightBaseline('AAPL', DATE);
  await getMidnightBaseline('AAPL', DATE);
  assert.equal(calls, 3);
});

test('in-flight sharing survives one cancelled consumer and an already cancelled cache hit rejects', async t => {
  const waiting = deferred(), started = deferred();
  let calls = 0, upstreamSignal;
  const { getMidnightBaseline } = client(t, async (_url, options) => {
    calls++;
    upstreamSignal = options.signal;
    started.resolve();
    return waiting.promise;
  });
  const cancelled = new AbortController(), remaining = new AbortController();
  const first = getMidnightBaseline('AAPL', DATE, cancelled.signal);
  const rejected = assert.rejects(first, { name: 'AbortError' });
  const second = getMidnightBaseline('AAPL', DATE, remaining.signal);
  await started.promise;
  cancelled.abort();
  await rejected;
  assert.equal(upstreamSignal.aborted, false);
  waiting.resolve(response(baseline()));
  assert.equal((await second).price, 230);
  await getMidnightBaseline('AAPL', DATE);
  await assert.rejects(getMidnightBaseline('AAPL', DATE, cancelled.signal), { name: 'AbortError' });
  assert.equal(calls, 1);
});

test('last-consumer cancellation prevents its late response from replacing a new cached success', async t => {
  const waiting = deferred(), started = deferred();
  let calls = 0, upstreamSignal;
  const { getMidnightBaseline } = client(t, async (_url, options) => {
    calls++;
    if (calls > 1) return response(baseline({ price: 231 }));
    upstreamSignal = options.signal;
    started.resolve();
    return waiting.promise;
  });
  const controller = new AbortController();
  const first = getMidnightBaseline('AAPL', DATE, controller.signal);
  const rejected = assert.rejects(first, { name: 'AbortError' });
  await started.promise;
  controller.abort();
  await rejected;
  assert.equal(upstreamSignal.aborted, true);
  assert.equal((await getMidnightBaseline('AAPL', DATE)).price, 231);
  waiting.resolve(response(baseline()));
  await flush();
  assert.equal((await getMidnightBaseline('AAPL', DATE)).price, 231);
  assert.equal(calls, 2);
});

test('a timed-out provider response cannot populate the baseline cache after recovery', async t => {
  const waiting = deferred();
  let calls = 0;
  const { getMidnightBaseline } = client(t, async () => {
    calls++;
    return calls === 1 ? waiting.promise : response(baseline({ price: 231 }));
  }, { now: NOW }, 10);
  await assert.rejects(getMidnightBaseline('AAPL', DATE), { name: 'TimeoutError' });
  assert.equal((await getMidnightBaseline('AAPL', DATE)).price, 231);
  waiting.resolve(response(baseline()));
  await flush();
  assert.equal((await getMidnightBaseline('AAPL', DATE)).price, 231);
  assert.equal(calls, 2);
});
