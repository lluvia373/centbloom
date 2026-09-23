import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescript } from './load-typescript.mjs';

const quote = (symbol, extra = {}) => ({ symbol, name: symbol, price: 100, currency: 'USD', change: 0, changePercent: 0, ...extra });
const result = symbols => ({ quotes: Object.fromEntries(symbols.map(symbol => [symbol, quote(symbol)])), errors: {} });
const response = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
const symbolsIn = url => new URL(String(url), 'https://test.invalid').searchParams.get('symbols').split(',');
const signal = () => new AbortController().signal;
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function clock(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.parse('2026-09-23T00:00:00Z') });
  return async ms => {
    t.mock.timers.tick(ms);
    for (let turn = 0; turn < 40; turn++) await Promise.resolve();
  };
}
function batchLoader(loadBatch, loadSingle = () => { throw new Error('Unexpected single request'); }) {
  return loadTypescript('src/features/market/quote-batch.ts').createQuoteBatch(loadBatch, loadSingle);
}
function api(t, fetcher) {
  t.mock.method(globalThis, 'fetch', fetcher);
  t.mock.method(console, 'warn', () => {});
  return loadTypescript('src/lib/stock-api.ts');
}

test('17 live symbols dispatch one validated request through the wired shared quote loader', async t => {
  const advance = clock(t), calls = [];
  const stockApi = api(t, async url => { calls.push(String(url)); return response(result(symbolsIn(url))); });
  let load;
  loadTypescript('src/hooks/useLiveQuotes.ts', {
    '@/lib/stock-api': stockApi,
    '@/features/market/quote-hub': { createQuoteHub: loader => { load = loader; return { empty: {} }; } },
  });
  const symbols = Array.from({ length: 17 }, (_, index) => `QA${index}`);
  const pending = Promise.all(symbols.map(symbol => load(symbol, signal())));
  await advance(0);
  const values = await pending;
  assert.equal(calls.length, 1);
  assert.deepEqual(symbolsIn(calls[0]), [...symbols].sort());
  assert.deepEqual(values.map(value => value.symbol), symbols);
});

test('duplicate symbols share a batch and one caller cancellation does not cancel remaining members', async t => {
  const advance = clock(t), gate = deferred(), calls = [];
  const load = batchLoader((symbols, requestSignal) => { calls.push({ symbols: Array.from(symbols), signal: requestSignal }); return gate.promise; });
  const one = new AbortController(), two = new AbortController(), other = new AbortController();
  const a = load('A', one.signal), duplicate = load('A', two.signal), b = load('B', other.signal);
  await advance(0);
  assert.deepEqual(calls[0].symbols, ['A', 'B']);
  const aRejected = assert.rejects(a, { name: 'AbortError' }); one.abort(); await aRejected;
  const bRejected = assert.rejects(b, { name: 'AbortError' }); other.abort(); await bRejected;
  assert.equal(calls[0].signal.aborted, false);
  gate.resolve(result(['A', 'B']));
  assert.equal((await duplicate).symbol, 'A');
  assert.equal(calls.length, 1);
});

test('last cancellation aborts only its shared batch and late results cannot replace a new request', async t => {
  const advance = clock(t), calls = [];
  const load = batchLoader((symbols, requestSignal) => {
    const gate = deferred(); calls.push({ symbols, signal: requestSignal, ...gate }); return gate.promise;
  });
  const a = new AbortController(), b = new AbortController();
  const oldA = load('A', a.signal), oldB = load('B', b.signal);
  await advance(0);
  const rejectedA = assert.rejects(oldA, { name: 'AbortError' }); a.abort(); await rejectedA;
  assert.equal(calls[0].signal.aborted, false);
  const rejectedB = assert.rejects(oldB, { name: 'AbortError' }); b.abort(); await rejectedB;
  assert.equal(calls[0].signal.aborted, true);
  const current = load('A', signal()); await advance(0);
  calls[0].resolve({ quotes: { A: quote('A', { price: 1 }), B: quote('B') }, errors: {} });
  calls[1].resolve({ quotes: { A: quote('A', { price: 200 }) }, errors: {} });
  assert.equal((await current).price, 200);
  assert.equal(calls[1].signal.aborted, false);
});

test('pre-dispatch cancellation removes its symbol and makes no request when all callers cancel', async t => {
  const advance = clock(t), calls = [];
  const load = batchLoader(async symbols => { calls.push(Array.from(symbols)); return result(symbols); });
  const a = new AbortController(), b = new AbortController();
  const cancelled = load('A', a.signal), pending = load('B', b.signal);
  const rejected = assert.rejects(cancelled, { name: 'AbortError' }); a.abort(); await rejected;
  await advance(0); await pending;
  assert.deepEqual(calls, [['B']]);
  const c = new AbortController(), unused = load('C', c.signal);
  const rejectedC = assert.rejects(unused, { name: 'AbortError' }); c.abort(); await rejectedC;
  await advance(0); assert.equal(calls.length, 1);
  await assert.rejects(load('C', c.signal), { name: 'AbortError' });
});

test('partial and missing member errors reject only those members with their status intact', async t => {
  const advance = clock(t);
  const load = batchLoader(async () => ({ quotes: { A: quote('A') }, errors: { B: { message: 'not found', status: 404 } } }));
  const a = load('A', signal()), b = load('B', signal()), missing = load('MISSING', signal());
  const rejectedB = assert.rejects(b, error => error.cause === 404 && error.message === 'not found');
  const rejectedMissing = assert.rejects(missing, error => error.cause === 502);
  await advance(0);
  assert.equal((await a).symbol, 'A'); await rejectedB; await rejectedMissing;
});

test('max-50 chunks dispatch without waiting for independent FX completion', async t => {
  const advance = clock(t), calls = [], fx = deferred();
  const load = batchLoader(async symbols => { calls.push(Array.from(symbols)); return result(symbols); }, (symbol, requestSignal) => {
    calls.push({ fx: symbol, signal: requestSignal }); return fx.promise;
  });
  const fxSignal = signal(), currency = load('USDKRW=X', fxSignal);
  const pending = Promise.all(Array.from({ length: 103 }, (_, index) => load(`QA${index}`, signal())));
  assert.equal(calls[0].fx, 'USDKRW=X'); assert.equal(calls[0].signal, fxSignal);
  await advance(0);
  assert.equal((await pending).length, 103);
  assert.deepEqual(calls.slice(1).map(symbols => symbols.length), [50, 50, 3]);
  fx.resolve(quote('USDKRW=X', { currency: 'KRW' })); await currency;
});

test('batch API validates identity, currency, positive prices and exactly one result per requested symbol', async t => {
  clock(t);
  const { getQuotes } = api(t, async () => response({
    quotes: {
      GOOD: quote('GOOD'), WRONG: quote('OTHER'), ZERO: quote('ZERO', { price: 0 }),
      CURRENCY: quote('CURRENCY', { currency: 'bad' }), BOTH: quote('BOTH'),
    },
    errors: { BOTH: { message: 'conflict', status: 404 }, NOTFOUND: { message: 'not found', status: 404 }, BADERROR: { message: '', status: 200 } },
  }));
  const output = await getQuotes(['GOOD', 'WRONG', 'ZERO', 'CURRENCY', 'BOTH', 'MISSING', 'NOTFOUND', 'BADERROR']);
  assert.deepEqual(Object.keys(output.quotes), ['GOOD']);
  assert.equal(output.errors.NOTFOUND.status, 404);
  for (const symbol of ['WRONG', 'ZERO', 'CURRENCY', 'BOTH', 'MISSING', 'BADERROR']) assert.equal(output.errors[symbol].status, 502, symbol);
  assert.equal(Object.keys(output.quotes).length + Object.keys(output.errors).length, 8);
});

test('successful normalized batches share five-second cache while partial errors never block recovery', async t => {
  const advance = clock(t); let count = 0, partial = false;
  const { getQuotes } = api(t, async url => {
    count++;
    return response(partial ? { quotes: {}, errors: { A: { message: 'temporarily unavailable', status: 503 } } } : result(symbolsIn(url)));
  });
  await getQuotes([' a ', 'A']); await getQuotes(['A']); assert.equal(count, 1);
  await advance(4_999); await getQuotes(['A']); assert.equal(count, 1);
  await advance(1); partial = true; await getQuotes(['A']); assert.equal(count, 2);
  partial = false; const recovered = await getQuotes(['A']);
  assert.equal(count, 3); assert.equal(recovered.quotes.A.price, 100);
});

test('invalid batch inputs never reach the transport', async t => {
  clock(t); let calls = 0;
  const { getQuotes } = api(t, async () => { calls++; return response(result([])); });
  for (const symbols of [[], ['USDKRW=X'], ['A/B'], Array.from({ length: 51 }, (_, index) => `QA${index}`)])
    await assert.rejects(getQuotes(symbols), error => error.cause === 400);
  assert.equal(calls, 0);
});

test('large live subscriptions keep the existing six-request transport limit', async t => {
  const advance = clock(t), calls = []; let active = 0, maximum = 0;
  const { getQuotes, getQuote } = api(t, async url => {
    active++; maximum = Math.max(maximum, active);
    const gate = deferred(), symbols = symbolsIn(url); calls.push({ symbols, ...gate });
    await gate.promise; active--; return response(result(symbols));
  });
  const load = batchLoader(getQuotes, getQuote);
  const pending = Promise.all(Array.from({ length: 301 }, (_, index) => load(`QA${index}`, signal())));
  await advance(0); assert.equal(calls.length, 6); assert.equal(maximum, 6);
  calls[0].resolve(); await advance(0);
  assert.equal(calls.length, 7); assert.equal(maximum, 6);
  calls.forEach(call => call.resolve());
  assert.equal((await pending).length, 301);
});

test('a live batch enters the next free slot ahead of queued historical work', async t => {
  const advance = clock(t), trace = [], busy = Array.from({ length: 6 }, deferred);
  const { marketRequests, getQuotes } = api(t, async url => { trace.push('batch'); return response(result(symbolsIn(url))); });
  const active = busy.map((gate, index) => marketRequests.request(`busy:${index}`, () => gate.promise));
  const historical = marketRequests.request('historical', async () => { trace.push('historical'); return 1; });
  const batch = getQuotes(['A']);
  busy[0].resolve(); await advance(0); await batch;
  assert.equal(trace[0], 'batch');
  busy.forEach(gate => gate.resolve()); await Promise.all([...active, historical]);
});

test('batch timeouts retain TimeoutError after the existing single immediate retry', async t => {
  const advance = clock(t), signals = [];
  const { getQuotes } = api(t, (_url, options) => { signals.push(options.signal); return new Promise(() => {}); });
  const rejected = assert.rejects(getQuotes(['A']), error => error.name === 'TimeoutError' && error.cause === undefined);
  await advance(0); assert.equal(signals.length, 1);
  await advance(20_000); assert.equal(signals[0].aborted, true);
  await advance(500); assert.equal(signals.length, 2);
  await advance(20_000); await rejected;
  assert.equal(signals[1].aborted, true);
});

test('batch upstream failure preserves its HTTP cause and retries only once', async t => {
  const advance = clock(t); let calls = 0;
  const { getQuotes } = api(t, async () => { calls++; return new Response(JSON.stringify({ error: 'upstream failed' }), { status: 502 }); });
  const rejected = assert.rejects(getQuotes(['A']), error => error.cause === 502);
  await advance(0); await advance(500); await rejected;
  assert.equal(calls, 2);
});
