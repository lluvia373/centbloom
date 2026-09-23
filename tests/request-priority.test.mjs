import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescript } from './load-typescript.mjs';

const { createRequestCache } = loadTypescript('src/shared/async/request-cache.ts');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('search uses the next free slot ahead of queued bulk work; active work stays intact', async () => {
  const cache = createRequestCache({ concurrency: 1 });
  const order = [];
  let release;
  let activeSignal;
  const active = cache.request('active', signal => {
    activeSignal = signal;
    return new Promise(resolve => { release = resolve; });
  });
  const normal = cache.request('chart', async () => { order.push('chart'); });
  const search = cache.request('search', async () => { order.push('search'); }, { priority: 'interactive' });
  await tick();
  assert.deepEqual(order, []);
  assert.equal(activeSignal.aborted, false);
  release();
  await Promise.all([active, normal, search]);
  assert.deepEqual(order, ['search', 'chart']);
});

test('continuous interactive requests cannot starve normal requests and each lane stays FIFO', async () => {
  const cache = createRequestCache({ concurrency: 1 });
  const order = [];
  let release;
  const active = cache.request('active', () => new Promise(resolve => { release = resolve; }));
  const normal = [1, 2].map(n => cache.request(`normal${n}`, async () => { order.push(`normal${n}`); }));
  const search = [1, 2, 3, 4, 5].map(n => cache.request(`search${n}`, async () => { order.push(`search${n}`); }, { priority: 'interactive' }));
  await tick(); release();
  await Promise.all([active, ...normal, ...search]);
  assert.deepEqual(order, ['search1', 'search2', 'search3', 'normal1', 'search4', 'search5', 'normal2']);
});

test('superseded searches leave the queue while identical subscribers share one request', async () => {
  const cache = createRequestCache({ concurrency: 1 });
  let release, calls = 0;
  const active = cache.request('active', () => new Promise(resolve => { release = resolve; }));
  const controller = new AbortController();
  const cancelled = cache.request('old-search', async () => { throw Error('must not run'); }, { signal: controller.signal, priority: 'interactive' });
  controller.abort();
  await assert.rejects(cancelled, { name: 'AbortError' });
  const load = async () => ++calls;
  const first = cache.request('same-search', load, { priority: 'interactive' });
  const second = cache.request('same-search', load, { priority: 'interactive' });
  await tick(); release();
  assert.deepEqual(await Promise.all([first, second]), [1, 1]);
  await active;
  assert.equal(calls, 1);
});

test('stock search starts in the next released slot with 200 quotes queued through the real client API', async t => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  const starts = [];
  const gates = new Map();
  const signals = new Map();
  const tasks = [];
  let draining = false, active = 0, peak = 0;
  globalThis.fetch = async (input, { signal }) => {
    const url = new URL(input, 'http://localhost');
    const search = url.pathname === '/api/search';
    const label = search ? 'SEARCH:AAPL' : decodeURIComponent(url.pathname.split('/').at(-1));
    starts.push(label);
    signals.set(label, signal);
    active++;
    peak = Math.max(peak, active);
    try {
      if (!draining) await new Promise((resolve, reject) => {
        const finish = () => { signal.removeEventListener('abort', abort); gates.delete(label); resolve(); };
        const abort = () => { signal.removeEventListener('abort', abort); gates.delete(label); reject(signal.reason); };
        gates.set(label, finish);
        signal.addEventListener('abort', abort, { once: true });
      });
      return Response.json(search ? [{ symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', type: 'EQUITY' }]
        : { symbol: label, price: 100, currency: 'USD' });
    } finally { active--; }
  };
  t.after(async () => {
    controller.abort();
    await Promise.allSettled(tasks);
    globalThis.fetch = originalFetch;
  });
  const { getQuote, searchStocks } = loadTypescript('src/lib/stock-api.ts');
  const symbols = Array.from({ length: 206 }, (_, index) => 'Q' + String(index).padStart(3, '0'));
  tasks.push(...symbols.map(symbol => getQuote(symbol, controller.signal)));
  await tick();
  assert.deepEqual(starts, symbols.slice(0, 6));
  const firstSearch = searchStocks('AAPL', 'all', controller.signal);
  const sameSearch = searchStocks('aapl', 'all', controller.signal);
  tasks.push(firstSearch, sameSearch);
  await tick();
  assert.deepEqual(starts, symbols.slice(0, 6));
  gates.get('Q000')();
  await tick();
  assert.deepEqual(starts, [...symbols.slice(0, 6), 'SEARCH:AAPL']);
  assert.ok([...signals.values()].every(signal => !signal.aborted));
  assert.equal(active, 6);
  draining = true;
  for (const release of [...gates.values()]) release();
  const results = await Promise.all(tasks);
  assert.deepEqual(starts, [...symbols.slice(0, 6), 'SEARCH:AAPL', ...symbols.slice(6)]);
  assert.equal(peak, 6);
  assert.equal(results.length, 208);
  assert.equal(results[206][0].symbol, 'AAPL');
  assert.equal(results[207][0].symbol, 'AAPL');
});
