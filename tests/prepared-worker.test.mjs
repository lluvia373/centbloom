import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { loadTypescript } from './load-typescript.mjs';

const { createPreparedQuotes } = loadTypescript('src/features/market/server/prepared-quotes.ts');
const { fxPair } = loadTypescript('src/features/market/fx.ts');
const source = ts.transpileModule(readFileSync('src/features/market/server/prepared-worker.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const base = Date.parse('2026-09-23T00:00:00Z');
const demandKey = 'market-demand:v1', cooldownKey = 'market-blocked-until:v1';
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const quote = (symbol, at, price = 101) => ({
  symbol, name: symbol, price, change: 1, changePercent: 1,
  currency: symbol.endsWith('=X') ? 'KRW' : 'USD',
  fetchedAt: new Date(at).toISOString(), quotedAt: '2026-09-22T20:00:00.000Z',
  ...(symbol.endsWith('=X') ? { fx: { valuationOnly: true } } : {}),
});
const result = (symbols, at, price) => ({
  quotes: Object.fromEntries(symbols.map(symbol => [symbol, quote(symbol, at, price)])), errors: {},
});
const request = symbols => new Request('https://prepared.internal/quotes', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbols }),
});

function harness({ load, clock = { now: base }, disk = { values: new Map(), alarm: null, puts: [], alarms: [] } } = {}) {
  const exports = {};
  class ClockDate extends Date { static now() { return clock.now; } }
  const dependencies = {
    '../fx': { fxPair },
    './provider': { validSymbol: symbol => /^[A-Za-z0-9.^=_-]{1,40}$/.test(symbol) },
    './prepared-quotes': { createPreparedQuotes: options => createPreparedQuotes({ ...options, now: () => clock.now }) },
    './quote-source': { loadPreparationQuotes: load ?? (async symbols => result(symbols, clock.now)) },
  };
  runInNewContext(source, {
    exports, require: name => {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`);
      return dependencies[name];
    },
    Date: ClockDate, Request, Response, URL, Uint8Array, TextDecoder, Error, JSON,
    Promise, Number, Object, Array, Math, Set, Map,
    setTimeout: () => { throw new Error('Durable preparation must use alarms, not timers'); },
    setInterval: () => { throw new Error('Durable preparation must use alarms, not timers'); },
  });
  let ready;
  const state = {
    storage: {
      async get(key) { return structuredClone(disk.values.get(key)); },
      async put(entries) {
        disk.puts.push(structuredClone(entries));
        for (const [key, value] of Object.entries(entries)) disk.values.set(key, structuredClone(value));
      },
      async getAlarm() { return disk.alarm; },
      async setAlarm(at) { disk.alarm = Number(at); disk.alarms.push(Number(at)); },
      async deleteAlarm() { disk.alarm = null; },
    },
    blockConcurrencyWhile(callback) { ready = Promise.resolve().then(callback); return ready; },
    waitUntil() { throw new Error('Metadata durability must not depend on waitUntil'); },
  };
  const worker = new exports.MarketQuotes(state, {});
  return {
    worker, clock, disk, ready,
    async fireAlarm(at = disk.alarm) {
      assert.notEqual(at, null);
      clock.now = at;
      disk.alarm = null;
      await worker.alarm();
    },
  };
}

test('internal endpoint validates method, bounded JSON and public-symbol-only fields before loading', async () => {
  let calls = 0;
  const h = harness({ load: async symbols => { calls++; return result(symbols, base); } });
  await h.ready;
  assert.equal((await h.worker.fetch(new Request('https://prepared.internal/other'))).status, 404);
  assert.equal((await h.worker.fetch(new Request('https://prepared.internal/quotes'))).status, 405);
  for (const body of [null, [], {}, { symbols: [] }, { symbols: ['AAPL'], userId: 'private' },
    { symbols: [{ symbol: 'AAPL', quantity: 10 }] }, { symbols: ['../bad'] },
    { symbols: ['USDUSD=X'] }, { symbols: ['BADFORMAT=X'] }, { symbols: Array(51).fill('AAPL') }]) {
    const response = await h.worker.fetch(new Request('https://prepared.internal/quotes', {
      method: 'POST', body: JSON.stringify(body),
    }));
    assert.equal(response.status, 400, JSON.stringify(body));
  }
  assert.equal((await h.worker.fetch(new Request('https://prepared.internal/quotes', {
    method: 'POST', body: '{not json',
  }))).status, 400);
  assert.equal((await h.worker.fetch(new Request('https://prepared.internal/quotes', {
    method: 'POST', body: JSON.stringify({ symbols: ['AAPL'], padding: 'x'.repeat(4096) }),
  }))).status, 413);
  assert.equal((await h.worker.fetch(new Request('https://prepared.internal/quotes', {
    method: 'POST', headers: { 'Content-Length': '4097' }, body: '{}',
  }))).status, 413);
  assert.equal(calls, 0);
  assert.equal(h.disk.alarm, null);
  assert.equal(h.disk.puts.length, 0);
});

test('canonical stock and FX reads preserve source values and only persist symbol/time demand', async () => {
  const calls = [];
  const h = harness({ load: async symbols => { calls.push([...symbols]); return result(symbols, base); } });
  const response = await h.worker.fetch(request([' usdkrw=x ', 'aapl', 'AAPL']));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const body = await response.json();
  assert.deepEqual(calls, [['AAPL', 'USDKRW=X']]);
  assert.equal(body.quotes.USDKRW_X, undefined);
  assert.equal(body.quotes['USDKRW=X'].fx.valuationOnly, true);
  assert.equal(body.quotes.AAPL.price, 101);
  assert.equal(body.quotes.AAPL.quotedAt, '2026-09-22T20:00:00.000Z');
  assert.deepEqual(h.disk.values.get(demandKey), [
    { symbol: 'AAPL', lastSeen: base }, { symbol: 'USDKRW=X', lastSeen: base },
  ]);
  assert.equal(JSON.stringify(h.disk.puts).includes('price'), false);
  assert.equal(h.disk.alarm, base + 25000);
});

test('alarm prepares active demand without another incoming read and stops after five idle minutes', async () => {
  const calls = [];
  const h = harness({ load: async symbols => { calls.push([...symbols]); return result(symbols, h.clock.now, calls.length * 101); } });
  await h.worker.fetch(request(['AAPL']));
  await h.fireAlarm();
  assert.equal(h.clock.now, base + 25000);
  assert.equal(calls.length, 2);
  assert.equal(h.disk.alarm, base + 50000);
  assert.deepEqual(h.disk.values.get(demandKey), [{ symbol: 'AAPL', lastSeen: base }]);
  await h.fireAlarm(base + 300000);
  assert.equal(calls.length, 2);
  assert.equal(h.disk.alarm, null);
  assert.deepEqual(h.disk.values.get(demandKey), []);
});

test('prepared response keeps its actual fetch time and does not cause another provider call', async () => {
  let calls = 0;
  const h = harness({ load: async symbols => result(symbols, h.clock.now, ++calls * 100) });
  await h.worker.fetch(request(['AAPL']));
  await h.fireAlarm();
  h.clock.now++;
  const body = await (await h.worker.fetch(request(['AAPL']))).json();
  assert.equal(body.quotes.AAPL.price, 200);
  assert.equal(body.quotes.AAPL.fetchedAt, new Date(base + 25000).toISOString());
  assert.equal(calls, 2);
});

test('persisted 429 deadline survives restart and early alarms without another source call', async () => {
  const clock = { now: base };
  let calls = 0;
  const load = async symbols => {
    if (++calls === 1) throw Object.assign(new Error('limited'), { status: 429, retryAfterSeconds: 120 });
    return result(symbols, clock.now);
  };
  const first = harness({ clock, load });
  const limited = await first.worker.fetch(request(['AAPL']));
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('Retry-After'), '120');
  assert.equal(first.disk.values.get(cooldownKey), base + 120000);
  const earlier = base + 30000;
  first.disk.alarm = earlier;
  clock.now += 20000;
  const restarted = harness({ clock, load, disk: first.disk });
  await restarted.ready;
  assert.equal(restarted.disk.alarm, earlier, 'constructor must not postpone an earlier alarm');
  const blocked = await restarted.worker.fetch(request(['MSFT']));
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('Retry-After'), '100');
  assert.equal(calls, 1);
  await restarted.fireAlarm(earlier);
  assert.equal(calls, 1);
  assert.equal(restarted.disk.alarm, base + 120000);
  clock.now = base + 119999;
  assert.equal((await restarted.worker.fetch(request(['NEW']))).headers.get('Retry-After'), '1');
  assert.equal(calls, 1);
  await restarted.fireAlarm(restarted.disk.alarm);
  assert.equal(calls, 2);
  assert.equal(restarted.disk.values.get(cooldownKey), 0);
});

test('a late provider 429 after caller cancellation is persisted before a restarted request', async () => {
  const late = deferred(), started = deferred();
  let calls = 0;
  const load = async () => { calls++; started.resolve(); return late.promise; };
  const h = harness({ load });
  const controller = new AbortController();
  const pending = h.worker.fetch(new Request(request(['AAPL']), { signal: controller.signal }));
  await started.promise;
  controller.abort();
  await pending;
  late.reject(Object.assign(new Error('late limited'), { status: 429, retryAfterSeconds: 120 }));
  await flush();
  assert.equal(h.disk.values.get(cooldownKey), base + 120000);
  const restarted = harness({ load, disk: h.disk, clock: h.clock });
  assert.equal((await restarted.worker.fetch(request(['MSFT']))).status, 429);
  assert.equal(calls, 1);
});

test('missing 429 metadata defaults to sixty seconds, while partial errors retain valid rows', async () => {
  let calls = 0;
  const h = harness({ load: async () => {
    calls++;
    return { quotes: { AAPL: quote('AAPL', base) }, errors: { LIMITED: { message: 'wait', status: 429 } } };
  } });
  const response = await h.worker.fetch(request(['AAPL', 'LIMITED']));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Retry-After'), '60');
  const body = await response.json();
  assert.equal(body.quotes.AAPL.price, 101);
  assert.deepEqual(body.errors.LIMITED, { message: 'wait', status: 429 });
  assert.equal(h.disk.values.get(cooldownKey), base + 60000);
  h.clock.now += 59000;
  const retry = await h.worker.fetch(request(['NEW']));
  assert.equal(retry.status, 429);
  assert.equal(retry.headers.get('Retry-After'), '1');
  assert.equal(calls, 1);
});

test('invalid values are errors, never invented quotes; valid FX format does not assert provider coverage', async () => {
  const h = harness({ load: async () => ({
    quotes: { AAPL: quote('AAPL', base), ZERO: quote('ZERO', base, 0) },
    errors: { 'AAAKRW=X': { message: 'not provided', status: 404 } },
  }) });
  const response = await h.worker.fetch(request(['AAPL', 'ZERO', 'AAAKRW=X']));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(Object.keys(body.quotes), ['AAPL']);
  assert.equal(body.errors.ZERO.status, 502);
  assert.deepEqual(body.errors['AAAKRW=X'], { message: 'not provided', status: 404 });
});

test('non-429 alarm failure is handled with the normal interval, without short automatic retries', async () => {
  let calls = 0;
  const h = harness({ load: async symbols => {
    if (++calls === 2) throw Object.assign(new Error('provider unavailable'), { status: 503 });
    return result(symbols, h.clock.now, calls * 100);
  } });
  await h.worker.fetch(request(['AAPL']));
  await h.fireAlarm();
  assert.equal(calls, 2);
  assert.equal(h.disk.alarm, base + 55000);
  await h.fireAlarm(base + 27000);
  assert.equal(calls, 2);
  assert.equal(h.disk.alarm, base + 55000);
  await h.fireAlarm();
  assert.equal(calls, 3);
});

test('slow foreground completion neither serializes another symbol nor overwrites newer demand', async () => {
  const slow = deferred(), started = deferred(), calls = [];
  const h = harness({ load: async symbols => {
    calls.push([...symbols]);
    if (symbols[0] === 'AAPL') { started.resolve(); return slow.promise; }
    return result(symbols, h.clock.now);
  } });
  const first = h.worker.fetch(request(['AAPL']));
  await started.promise;
  h.clock.now += 1000;
  const second = await h.worker.fetch(request(['MSFT']));
  assert.equal(second.status, 200);
  assert.deepEqual(calls, [['AAPL'], ['MSFT']]);
  slow.resolve(result(['AAPL'], base));
  await first;
  assert.deepEqual(h.disk.values.get(demandKey), [
    { symbol: 'AAPL', lastSeen: base }, { symbol: 'MSFT', lastSeen: base + 1000 },
  ]);
  assert.equal(h.disk.alarm, base + 25000);
});

test('foreground retention supports two hundred symbols while background preparation stays bounded at fifty', async () => {
  const calls = [];
  const h = harness({ load: async symbols => { calls.push([...symbols]); return result(symbols, h.clock.now); } });
  for (let offset = 0; offset < 200; offset += 50) {
    const response = await h.worker.fetch(request(Array.from({ length: 50 }, (_, i) => `S${offset + i}`)));
    assert.equal(Object.keys((await response.json()).quotes).length, 50);
  }
  await h.worker.fetch(request(['S0']));
  assert.equal(calls.length, 4, 'background cap must not evict a foreground quote');
  await h.fireAlarm();
  assert.deepEqual(calls.map(symbols => symbols.length), [50, 50, 50, 50, 50]);
  assert.equal(h.disk.values.get(demandKey).length, 200);
});

test('restore sanitizes expired/private demand and keeps an earlier alarm without persisting quotes', async () => {
  const disk = { values: new Map([
    [demandKey, [
      { symbol: 'AAPL', lastSeen: base - 1, quantity: 12 },
      { symbol: 'OLD', lastSeen: base - 300000 },
      { symbol: 'FUTURE', lastSeen: base + 1 },
    ]],
  ]), alarm: base + 500, puts: [], alarms: [] };
  const h = harness({ disk });
  await h.ready;
  assert.equal(disk.alarm, base + 500);
  assert.deepEqual(disk.values.get(demandKey), [{ symbol: 'AAPL', lastSeen: base - 1 }]);
  await h.fireAlarm();
  assert.ok(disk.alarm >= h.clock.now + 1000);
  await flush();
  assert.equal(JSON.stringify(disk.puts).includes('price'), false);
});
