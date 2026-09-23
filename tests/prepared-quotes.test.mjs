import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescript } from './load-typescript.mjs';

const { createPreparedQuotes } = loadTypescript('src/features/market/server/prepared-quotes.ts');
const base = Date.parse('2026-09-23T00:00:00Z');
const quote = (symbol, fetchedAt = base, price = 100) => ({
  symbol, name: symbol, price, change: 1, changePercent: 1, currency: 'USD',
  fetchedAt: new Date(fetchedAt).toISOString(), quotedAt: '2026-09-22T20:00:00.000Z',
});
const result = (symbols, at = base) => ({ quotes: Object.fromEntries(symbols.map(symbol => [symbol, quote(symbol, at)])), errors: {} });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

test('freshness is measured from original fetchedAt and overlapping reads share each symbol', async () => {
  let now = base, calls = [];
  const engine = createPreparedQuotes({ now: () => now, load: async symbols => { calls.push([...symbols]); return result(symbols, now - 5000); } });
  const first = await engine.read([' aapl ', 'MSFT', 'AAPL']);
  assert.equal(first.quotes.AAPL.fetchedAt, new Date(base - 5000).toISOString());
  now += 24999;
  assert.equal((await engine.read(['AAPL'])).quotes.AAPL, first.quotes.AAPL);
  assert.equal(calls.length, 1);
  now++;
  await engine.read(['AAPL', 'NVDA']);
  assert.deepEqual(calls, [['AAPL', 'MSFT'], ['AAPL', 'NVDA']]);
  assert.equal(first.quotes.AAPL.quotedAt, '2026-09-22T20:00:00.000Z');
});

test('intersecting in-flight groups share symbols without serializing unrelated symbols', async () => {
  const calls = [];
  const engine = createPreparedQuotes({ now: () => base, load: (symbols, signal) => { const job = deferred(); calls.push({ symbols: [...symbols], signal, ...job }); return job.promise; } });
  const first = engine.read(['AAPL', 'MSFT']), second = engine.read(['MSFT', 'NVDA']);
  await flush();
  assert.deepEqual(calls.map(call => call.symbols), [['AAPL', 'MSFT'], ['NVDA']]);
  for (const call of calls) call.resolve(result(call.symbols));
  assert.equal((await first).quotes.MSFT, (await second).quotes.MSFT);
});

test('partial success survives, while missing, conflicting, invalid and expired rows are never fresh', async () => {
  let calls = 0;
  const engine = createPreparedQuotes({ now: () => base, load: async symbols => {
    calls++;
    if (calls > 1) return result(symbols);
    return { quotes: { AAPL: quote('AAPL'), OLD: quote('OLD', base - 30000), FUTURE: quote('FUTURE', base + 1),
      WRONG: quote('OTHER'), ZERO: quote('ZERO', base, 0), CONFLICT: quote('CONFLICT'), NO_TIME: { ...quote('NO_TIME'), fetchedAt: undefined } },
    errors: { CONFLICT: { status: 404, message: 'conflicting' }, MISSING: { status: 404, message: 'missing' } } };
  } });
  const symbols = ['AAPL', 'OLD', 'FUTURE', 'WRONG', 'ZERO', 'CONFLICT', 'NO_TIME', 'MISSING', 'ABSENT'];
  const first = await engine.read(symbols);
  assert.deepEqual(Object.keys(first.quotes), ['AAPL']);
  assert.equal(Object.keys(first.errors).length, 8);
  assert.equal(first.errors.MISSING.status, 404);
  await engine.read(['AAPL']);
  assert.equal(calls, 1);
  assert.equal((await engine.read(['MISSING'])).quotes.MISSING.price, 100);
  assert.equal(calls, 2);
});

test('refresh failure revokes an otherwise fresh quote and preserves the original upstream error', async () => {
  let now = base, calls = 0;
  const error = Object.assign(new Error('provider failed'), { status: 503 });
  const engine = createPreparedQuotes({ now: () => now, load: async symbols => { if (++calls > 1) throw error; return result(symbols); } });
  await engine.read(['AAPL']);
  now += 25000;
  await assert.rejects(engine.prepare(), value => value === error);
  assert.equal(engine.nextPreparationAt(), now + 30000);
  await assert.rejects(engine.read(['AAPL']), value => value === error);
  assert.equal(calls, 3);
});

test('one subscriber abort does not affect others; final abort cancels upstream and late results cannot warm cache', async () => {
  const calls = [];
  const engine = createPreparedQuotes({ now: () => base, load: (symbols, signal) => { const job = deferred(); calls.push({ symbols: [...symbols], signal, ...job }); return job.promise; } });
  const a = new AbortController(), b = new AbortController();
  const first = engine.read(['AAPL'], a.signal), second = engine.read(['AAPL'], b.signal);
  await flush();
  a.abort();
  await assert.rejects(first, value => value.name === 'AbortError');
  assert.equal(calls[0].signal.aborted, false);
  calls[0].resolve(result(['AAPL']));
  await second;
  const only = new AbortController();
  const abandoned = engine.read(['MSFT'], only.signal);
  await flush();
  only.abort();
  await assert.rejects(abandoned, value => value.name === 'AbortError');
  assert.equal(calls[1].signal.aborted, true);
  const replacement = engine.read(['MSFT']);
  await flush();
  calls[1].resolve(result(['MSFT']));
  await flush();
  calls[2].resolve({ quotes: { MSFT: quote('MSFT', base, 200) }, errors: {} });
  assert.equal((await replacement).quotes.MSFT.price, 200);
  assert.equal((await engine.read(['MSFT'])).quotes.MSFT.price, 200);
  assert.equal(calls.length, 3);
});

test('429 cooldown is global across new symbols, keeps the original error and reports remaining Retry-After', async () => {
  let now = base, calls = 0;
  const error = Object.assign(new Error('auth limited'), { status: 429, retryAfterSeconds: 120, providerEndpoint: 'auth' });
  const engine = createPreparedQuotes({ now: () => now, load: async symbols => { if (++calls === 1) throw error; return result(symbols, now); } });
  await assert.rejects(engine.read(['AAPL']), value => value === error);
  now += 20000;
  await assert.rejects(engine.read(['NEW']), value => value.status === 429 && value.retryAfterSeconds === 100 && value.providerEndpoint === 'auth');
  await assert.rejects(engine.prepare(), value => value.status === 429);
  assert.equal(calls, 1);
  assert.equal(engine.nextPreparationAt(), base + 120000);
  now = base + 120000;
  assert.equal((await engine.read(['NEW'])).quotes.NEW.price, 100);
  assert.equal(calls, 2);
});

test('429 without retry metadata uses 60 seconds, including partial-result rate limiting', async () => {
  let now = base, calls = 0;
  const engine = createPreparedQuotes({ now: () => now, load: async symbols => { calls++; return { quotes: {}, errors: Object.fromEntries(symbols.map(symbol => [symbol, { message: 'limited', status: 429 }])) }; } });
  assert.equal((await engine.read(['AAPL'])).errors.AAPL.status, 429);
  now += 59999;
  await assert.rejects(engine.read(['MSFT']), value => value.status === 429 && value.retryAfterSeconds === 1);
  assert.equal(calls, 1);
  now++;
  await engine.read(['MSFT']);
  assert.equal(calls, 2);
});

test('200 requested symbols all return, preparation is capped at 50 and does not renew demand', async () => {
  let now = base;
  const calls = [];
  const engine = createPreparedQuotes({ now: () => now, load: async symbols => { calls.push([...symbols]); return result(symbols, now); } });
  const symbols = Array.from({ length: 200 }, (_, i) => `S${i}`);
  assert.equal(Object.keys((await engine.read(symbols)).quotes).length, 200);
  assert.deepEqual(calls.map(call => call.length), [50, 50, 50, 50]);
  const snapshot = JSON.stringify(engine.demandSnapshot());
  now += 30000;
  assert.equal(Object.keys((await engine.prepare()).quotes).length, 50);
  assert.equal(calls.length, 5);
  assert.equal(JSON.stringify(engine.demandSnapshot()), snapshot);
  now = base + 300000;
  assert.equal(engine.nextPreparationAt(), null);
  assert.equal(engine.demandSnapshot().length, 0);
  assert.equal(Object.keys((await engine.prepare()).quotes).length, 0);
  assert.equal(calls.length, 5);
});

test('demand persistence contains only bounded symbol/time pairs and ignores expired or invalid entries', async () => {
  let now = base;
  const engine = createPreparedQuotes({ now: () => now, maxEntries: 2, load: async symbols => result(symbols, now) });
  engine.restoreDemand([{ symbol: 'AAPL', lastSeen: base - 1, userId: 'never stored' },
    { symbol: 'OLD', lastSeen: base - 300000 }, { symbol: 'FUTURE', lastSeen: base + 1 },
    { symbol: 'USDKR=X', lastSeen: base }, { symbol: '../bad', lastSeen: base },
    { symbol: 'MSFT', lastSeen: base }]);
  assert.deepEqual(JSON.parse(JSON.stringify(engine.demandSnapshot())), [{ symbol: 'AAPL', lastSeen: base - 1 }, { symbol: 'MSFT', lastSeen: base }]);
  assert.equal(engine.nextPreparationAt(), base);
  now++;
  await engine.read(['NVDA']);
  assert.deepEqual([...engine.demandSnapshot()].map(item => item.symbol).sort(), ['MSFT', 'NVDA']);
  await assert.rejects(engine.read(['AAPL', 'USDKR=X']), value => value.status === 400);
});

test('a slow batch member cannot make an expired cached quote look fresh at response time', async () => {
  let now = base;
  const job = deferred();
  const engine = createPreparedQuotes({ now: () => now, load: async symbols => symbols.includes('MSFT') ? job.promise : result(symbols, now) });
  await engine.read(['AAPL']);
  now += 29000;
  const pending = engine.read(['AAPL', 'MSFT']);
  await flush();
  now += 2000;
  job.resolve(result(['MSFT'], now));
  const response = await pending;
  assert.equal(response.quotes.AAPL, undefined);
  assert.equal(response.errors.AAPL.status, 502);
  assert.equal(response.quotes.MSFT.price, 100);
});

test('background refresh leaves fresh reads immediate until actual failure, and prepares five seconds before expiry', async () => {
  let now = base, calls = 0;
  const job = deferred();
  const engine = createPreparedQuotes({ now: () => now, load: async symbols => ++calls === 1 ? result(symbols, now) : job.promise });
  const original = (await engine.read(['AAPL'])).quotes.AAPL;
  assert.equal(engine.nextPreparationAt(), base + 25000);
  now = base + 25000;
  const preparing = engine.prepare();
  await flush();
  assert.equal((await engine.read(['AAPL'])).quotes.AAPL, original);
  assert.equal(calls, 2);
  const failed = new Error('refresh failed');
  job.reject(failed);
  await assert.rejects(preparing, error => error === failed);
  await assert.rejects(engine.read(['AAPL']), error => error === failed);
  assert.equal(calls, 3);
});

test('supported FX shapes join public quote preparation, while malformed FX and mismatched identities fail', async () => {
  const calls = [];
  const engine = createPreparedQuotes({ now: () => base, load: async symbols => {
    calls.push([...symbols]);
    return { quotes: Object.fromEntries(symbols.map(symbol => [symbol, {
      ...quote(symbol), currency: symbol === 'EURUSD=X' ? 'USD' : 'KRW',
    }])), errors: {} };
  } });
  const fx = await engine.read([' usdkrw=x ', 'KRW=X', 'CNYKRW=X', 'EURUSD=X']);
  assert.deepEqual(Object.keys(fx.quotes), ['USDKRW=X', 'KRW=X', 'CNYKRW=X', 'EURUSD=X']);
  await engine.read(['USDKRW=X']);
  assert.equal(calls.length, 1);
  for (const symbol of ['USDKR=X', 'USDKRWW=X', '=X', 'USD1KRW=X'])
    await assert.rejects(engine.read([symbol]), error => error.status === 400);
  const wrongAlias = createPreparedQuotes({ now: () => base, load: async () => ({
    quotes: { 'USDKRW=X': { ...quote('KRW=X'), currency: 'KRW' } }, errors: {},
  }) });
  assert.equal((await wrongAlias.read(['USDKRW=X'])).errors['USDKRW=X'].status, 502);
});

test('preparation loads only due demand, not other fresh symbols when a new symbol arrives', async () => {
  let now = base;
  const calls = [];
  const engine = createPreparedQuotes({ now: () => now, load: async symbols => { calls.push([...symbols]); return result(symbols, now); } });
  await engine.read(['AAPL']);
  now += 10000;
  await engine.read(['MSFT']);
  assert.equal(Object.keys((await engine.prepare()).quotes).length, 0);
  assert.equal(calls.length, 2);
  now = base + 25000;
  await engine.prepare();
  assert.deepEqual(calls[2], ['AAPL']);
  assert.equal(engine.nextPreparationAt(), base + 35000);
});

test('unchanged fetchedAt has a five-second preparation floor without extending quote freshness', async () => {
  let now = base, calls = 0;
  const engine = createPreparedQuotes({ now: () => now, load: async symbols => { calls++; return result(symbols, base); } });
  await engine.read(['AAPL']);
  now = base + 26000;
  const prepared = await engine.prepare();
  assert.equal(prepared.quotes.AAPL.fetchedAt, new Date(base).toISOString());
  assert.equal(engine.nextPreparationAt(), base + 31000);
  assert.equal(Object.keys((await engine.prepare()).quotes).length, 0);
  assert.equal(calls, 2);
  now = base + 30000;
  const expired = await engine.read(['AAPL']);
  assert.equal(expired.quotes.AAPL, undefined);
  assert.equal(expired.errors.AAPL.status, 502);
  assert.equal(calls, 3);
});
