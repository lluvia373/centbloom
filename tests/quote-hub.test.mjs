import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescript } from './load-typescript.mjs';

const { createQuoteHub } = loadTypescript('src/features/market/quote-hub.ts');
const quote = (symbol, price = 100) => ({ symbol, price, currency: 'USD' });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
async function until(predicate) {
  for (let attempt = 0; attempt < 100 && !predicate(); attempt++) await pause(5);
  assert.ok(predicate(), 'Expected quote operation to complete within the test deadline');
}

test('new quote subscriptions start while an unrelated quote is still pending', async t => {
  const slow = deferred();
  const calls = [];
  const hub = createQuoteHub(async symbol => {
    calls.push(symbol);
    if (symbol === 'SLOW') await slow.promise;
    return quote(symbol);
  }, 60_000);
  const stopSlow = hub.subscribe(['SLOW'], () => {});
  let stopNew = () => {};
  t.after(() => { stopSlow(); stopNew(); slow.resolve(); });
  await until(() => calls.includes('SLOW'));
  stopNew = hub.subscribe(['NEW'], () => {});
  await until(() => !!hub.snapshot(['NEW']).quotes.NEW);
  assert.equal(hub.snapshot(['SLOW']).loading, true);
  assert.equal(calls.filter(symbol => symbol === 'SLOW').length, 1);
});

test('only a symbol with no remaining consumers is cancelled; late old results cannot replace a new subscription', async t => {
  const requests = [];
  const hub = createQuoteHub((symbol, signal) => {
    const completion = deferred();
    requests.push({ symbol, signal, ...completion });
    return completion.promise;
  }, 60_000);
  const stopPair = hub.subscribe(['A', 'B'], () => {});
  const stopShared = hub.subscribe(['B'], () => {});
  let stopNew = () => {};
  t.after(() => { stopPair(); stopShared(); stopNew(); requests.forEach(request => request.resolve(quote(request.symbol))); });
  await until(() => requests.length === 2);
  const oldA = requests.find(request => request.symbol === 'A');
  const sharedB = requests.find(request => request.symbol === 'B');
  stopPair();
  assert.equal(oldA.signal.aborted, true);
  assert.equal(sharedB.signal.aborted, false);
  stopNew = hub.subscribe(['A'], () => {});
  await until(() => requests.length === 3);
  const newA = requests[2];
  newA.resolve(quote('A', 200));
  await until(() => hub.snapshot(['A']).quotes.A?.price === 200);
  oldA.resolve(quote('A', 50));
  sharedB.resolve(quote('B'));
  await until(() => !!hub.snapshot(['B']).quotes.B);
  assert.equal(hub.snapshot(['A']).quotes.A.price, 200);
  assert.equal(requests.filter(request => request.symbol === 'B').length, 1);
});

test('a settled quote keeps its polling interval while another quote is slow; hidden views pause polling', async t => {
  const slow = deferred();
  const calls = [];
  const hub = createQuoteHub(async symbol => {
    calls.push(symbol);
    if (symbol === 'SLOW') await slow.promise;
    return quote(symbol);
  }, 15);
  const stop = hub.subscribe(['FAST', 'SLOW'], () => {});
  t.after(() => { stop(); slow.resolve(); });
  await until(() => calls.filter(symbol => symbol === 'FAST').length >= 2);
  assert.equal(calls.filter(symbol => symbol === 'SLOW').length, 1);
  assert.equal(hub.snapshot(['SLOW']).loading, true);
  hub.setVisible(false);
  const before = calls.length;
  await pause(35);
  assert.equal(calls.length, before);
  assert.equal(hub.snapshot(['FAST']).quotes.FAST.price, 100);
  hub.setVisible(true);
  await until(() => calls.length > before);
});

test('manual refresh shares pending symbols while immediately refreshing settled ones', async t => {
  const slow = deferred();
  const calls = [];
  const hub = createQuoteHub(async symbol => {
    calls.push(symbol);
    if (symbol === 'SLOW') await slow.promise;
    return quote(symbol);
  }, 60_000);
  const stop = hub.subscribe(['FAST', 'SLOW'], () => {});
  t.after(() => { stop(); slow.resolve(); });
  await until(() => !!hub.snapshot(['FAST']).quotes.FAST);
  await hub.refresh();
  assert.equal(calls.filter(symbol => symbol === 'FAST').length, 2);
  assert.equal(calls.filter(symbol => symbol === 'SLOW').length, 1);
  assert.equal(hub.snapshot(['SLOW']).loading, true);
});

test('removing all consumers aborts every pending symbol and prevents late publication or polling', async t => {
  const requests = [];
  const hub = createQuoteHub((symbol, signal) => {
    const completion = deferred();
    requests.push({ symbol, signal, ...completion });
    return completion.promise;
  }, 15);
  const stop = hub.subscribe(['A', 'B'], () => {});
  t.after(() => { stop(); requests.forEach(request => request.resolve(quote(request.symbol))); });
  await until(() => requests.length === 2);
  stop();
  assert.ok(requests.every(request => request.signal.aborted));
  requests.forEach(request => request.resolve(quote(request.symbol)));
  await pause(35);
  assert.equal(requests.length, 2);
  assert.equal(Object.keys(hub.snapshot(['A', 'B']).quotes).length, 0);
});

function recoveryClock(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000 });
  // Load after installing the clock so the existing VM helper receives its timers.
  const { createQuoteHub } = loadTypescript('src/features/market/quote-hub.ts');
  const advance = async ms => {
    t.mock.timers.tick(ms);
    for (let turn = 0; turn < 12; turn++) await Promise.resolve();
  };
  return { createQuoteHub, advance };
}

test('transient failures use one shared 1s, 2s, 5s recovery sequence then normal polling', async t => {
  const { createQuoteHub, advance } = recoveryClock(t), calls = [];
  const hub = createQuoteHub(async symbol => {
    calls.push({ symbol, at: Date.now() });
    if (symbol === 'FAIL') throw new Error('upstream unavailable', { cause: 502 });
    return quote(symbol);
  });
  const stopA = hub.subscribe(['FAIL', 'OK'], () => {}), stopB = hub.subscribe(['FAIL'], () => {});
  t.after(() => { stopA(); stopB(); });
  await advance(0);
  assert.deepEqual(calls, [{ symbol: 'FAIL', at: 1_000 }, { symbol: 'OK', at: 1_000 }]);
  await advance(999); assert.equal(calls.length, 2);
  await advance(1);
  await advance(2_000);
  await advance(5_000);
  assert.deepEqual(calls.filter(call => call.symbol === 'FAIL').map(call => call.at), [1_000, 2_000, 4_000, 9_000]);
  await advance(21_999);
  assert.equal(calls.filter(call => call.symbol === 'FAIL').length, 4);
  await advance(1);
  assert.deepEqual(calls.filter(call => call.symbol === 'OK').map(call => call.at), [1_000, 31_000]);
  await advance(7_999);
  assert.equal(calls.filter(call => call.symbol === 'FAIL').length, 4);
  await advance(1);
  assert.deepEqual(calls.filter(call => call.symbol === 'FAIL').map(call => call.at), [1_000, 2_000, 4_000, 9_000, 39_000]);
  await advance(29_999);
  assert.equal(calls.filter(call => call.symbol === 'FAIL').length, 5);
  await advance(1);
  assert.equal(calls.filter(call => call.symbol === 'FAIL').at(-1).at, 69_000);
});

test('permanent 404, rate-limit 429 and invalid responses do not enter early recovery', async t => {
  const { createQuoteHub, advance } = recoveryClock(t), calls = [];
  const hub = createQuoteHub(async symbol => {
    calls.push({ symbol, at: Date.now() });
    if (symbol === 'LIMITED') throw new Error('rate limited', { cause: 429 });
    throw symbol === 'MISSING' ? new Error('missing', { cause: 404 }) : new Error('invalid price');
  });
  const stop = hub.subscribe(['MISSING', 'LIMITED', 'INVALID'], () => {}); t.after(stop);
  await advance(0); await advance(29_999);
  assert.equal(calls.length, 3);
  await advance(1);
  assert.equal(calls.length, 5);
  assert.ok(calls.slice(3).every(call => call.at === 31_000));
  assert.equal(calls.filter(call => call.symbol === 'LIMITED').length, 1);
  await advance(29_999);
  assert.equal(calls.filter(call => call.symbol === 'LIMITED').length, 1);
  await advance(1);
  assert.deepEqual(calls.filter(call => call.symbol === 'LIMITED').map(call => call.at), [1_000, 61_000]);
});

test('recovery retains confirmed data and the failure until success, then resets its backoff', async t => {
  const { createQuoteHub, advance } = recoveryClock(t), gate = deferred();
  let calls = 0;
  const confirmed = { ...quote('A'), quotedAt: '2026-09-23T00:00:00Z', fetchedAt: '2026-09-23T00:00:01Z' };
  const hub = createQuoteHub(async () => {
    calls++;
    if (calls === 1) return confirmed;
    if (calls === 3) return gate.promise;
    throw new Error('offline', { cause: 'network' });
  });
  const stop = hub.subscribe(['A'], () => {}); t.after(() => { stop(); gate.resolve(confirmed); });
  await advance(0);
  await hub.refresh();
  assert.equal(hub.snapshot(['A']).quotes.A, confirmed);
  assert.deepEqual(Array.from(hub.snapshot(['A']).failedSymbols), ['A']);
  await advance(1_000);
  assert.equal(calls, 3);
  assert.equal(hub.snapshot(['A']).refreshing, true);
  assert.deepEqual(Array.from(hub.snapshot(['A']).failedSymbols), ['A']);
  assert.equal(hub.snapshot(['A']).quotes.A.quotedAt, confirmed.quotedAt);
  gate.resolve({ ...confirmed, price: 200 }); await advance(0);
  assert.equal(hub.snapshot(['A']).quotes.A.price, 200);
  assert.deepEqual(Array.from(hub.snapshot(['A']).failedSymbols), []);
  await hub.refresh();
  assert.equal(calls, 4);
  await advance(999); assert.equal(calls, 4);
  await advance(1); assert.equal(calls, 5, 'success resets the next recovery delay to one second');
});

test('hidden and released subscriptions suppress scheduled recovery, and shared manual recovery stays deduplicated', async t => {
  const { createQuoteHub, advance } = recoveryClock(t), gate = deferred();
  const requests = [];
  const hub = createQuoteHub(async (symbol, signal) => {
    requests.push({ symbol, signal });
    if (requests.length === 1) throw new DOMException('timed out', 'TimeoutError');
    return gate.promise;
  });
  const stopA = hub.subscribe(['A'], () => {}), stopB = hub.subscribe(['A'], () => {});
  t.after(() => { stopA(); stopB(); gate.resolve(quote('A')); });
  await advance(0);
  hub.setVisible(false); await advance(10_000);
  assert.equal(requests.length, 1);
  hub.setVisible(true); await advance(0);
  assert.equal(requests.length, 2);
  await hub.refresh();
  assert.equal(requests.length, 2);
  stopA(); assert.equal(requests[1].signal.aborted, false);
  stopB(); assert.equal(requests[1].signal.aborted, true);
  gate.resolve(quote('A')); await advance(60_000);
  assert.equal(requests.length, 2);
  assert.equal(Object.keys(hub.snapshot(['A']).quotes).length, 0);
});
