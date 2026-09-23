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

test('re-entry reuses a normal public quote immediately without restarting its refresh interval', async t => {
  const { createQuoteHub, advance } = recoveryClock(t);
  let calls = 0;
  const confirmed = { ...quote('A'), quotedAt: '1970-01-01T00:00:00Z', fetchedAt: '1970-01-01T00:00:01Z' };
  const hub = createQuoteHub(async () => { calls++; return { ...confirmed, fetchedAt: new Date().toISOString() }; });
  let stop = hub.subscribe(['A'], () => {}); t.after(() => stop());
  await advance(0);
  const first = hub.snapshot(['A']);
  stop(); await advance(10_000);
  assert.equal(calls, 1, 'no polling when there are no consumers');
  assert.equal(hub.snapshot(['A']).quotes.A, first.quotes.A, 'React can read retained data before subscribing');
  assert.equal(hub.snapshot(['A']).loading, false);
  assert.equal(hub.snapshot(['A']).refreshing, false);
  stop = hub.subscribe(['A'], () => {}); await advance(0);
  assert.equal(calls, 1);
  assert.equal(hub.snapshot(['A']).checkedAt, first.checkedAt);
  assert.equal(hub.snapshot(['A']).quotes.A.quotedAt, confirmed.quotedAt);
  await advance(19_999); assert.equal(calls, 1);
  await advance(1); assert.equal(calls, 2, 'refresh is due at the original deadline, not 30s after re-entry');
});

test('expired retained data disappears before re-subscription and late cancellation cannot refresh it', async t => {
  const { createQuoteHub, advance } = recoveryClock(t), pending = [];
  const hub = createQuoteHub((symbol, signal) => {
    const completion = deferred(); pending.push({ signal, ...completion }); return completion.promise;
  });
  let stop = hub.subscribe(['A'], () => {});
  t.after(() => { stop(); pending.forEach(request => request.resolve(quote('A'))); });
  await advance(0); pending[0].resolve(quote('A')); await advance(0);
  const old = hub.snapshot(['A']).quotes.A;
  const refreshing = hub.refresh(); await advance(0);
  stop(); assert.equal(pending[1].signal.aborted, true);
  stop = hub.subscribe(['A'], () => {}); await advance(0);
  assert.equal(hub.snapshot(['A']).quotes.A, old);
  assert.equal(hub.snapshot(['A']).refreshing, false);
  pending[1].resolve(quote('A', 1)); await refreshing;
  assert.equal(hub.snapshot(['A']).quotes.A, old);
  stop(); await advance(30_000);
  assert.equal(pending.length, 2);
  assert.equal(hub.snapshot(['A']).quotes.A, undefined);
  assert.equal(hub.snapshot(['A']).loading, true);
  stop = hub.subscribe(['A'], () => {}); await advance(0);
  assert.equal(pending.length, 3);
  assert.equal(hub.snapshot(['A']).quotes.A, undefined);
  pending[2].resolve(quote('A', 200)); await advance(0);
  assert.equal(hub.snapshot(['A']).quotes.A.price, 200);
});

test('original fetchedAt bounds reuse and already expired responses never become normal cold-screen data', async t => {
  const { createQuoteHub, advance } = recoveryClock(t), calls = [];
  const valid = { ...quote('A'), fetchedAt: '1970-01-01T00:00:00Z', quotedAt: '1969-12-31T23:59:00Z', fx: { valuationOnly: true } };
  const hub = createQuoteHub(async symbol => { calls.push(symbol); return symbol === 'A' ? valid : { ...quote(symbol), fetchedAt: '1969-12-31T23:59:30Z' }; });
  let stop = hub.subscribe(['A', 'EXPIRED'], () => {}); t.after(() => stop());
  await advance(0);
  assert.equal(hub.snapshot(['A']).quotes.A, valid, 'provider timestamps and valuation-only metadata are untouched');
  assert.equal(hub.snapshot(['EXPIRED']).quotes.EXPIRED, undefined);
  assert.deepEqual(Array.from(hub.snapshot(['EXPIRED']).failedSymbols), ['EXPIRED']);
  await advance(0); assert.equal(calls.length, 2, 'expired responses do not create an immediate retry loop');
  stop(); await advance(28_999);
  assert.equal(hub.snapshot(['A']).quotes.A, valid);
  await advance(1);
  assert.equal(hub.snapshot(['A']).quotes.A, undefined, 'original fetch expires at 30s, not receipt time plus 30s');
  stop = hub.subscribe(['A'], () => {}); await advance(0);
  assert.equal(hub.snapshot(['A']).quotes.A, undefined);
  assert.deepEqual(Array.from(hub.snapshot(['A']).failedSymbols), ['A']);
  assert.equal(calls.length, 3);
  await advance(0); assert.equal(calls.length, 3);
});

test('repeated expired responses use 1/2/5-second recovery before returning to the normal interval', async t => {
  const { createQuoteHub, advance } = recoveryClock(t), calls = [];
  const hub = createQuoteHub(async () => {
    calls.push(Date.now());
    return { ...quote('EXPIRED'), fetchedAt: '1969-12-31T23:59:30Z' };
  });
  const stop = hub.subscribe(['EXPIRED'], () => {}); t.after(stop);
  await advance(0);
  assert.deepEqual(calls, [1_000]);
  for (const [delay, expected] of [[1_000, 2_000], [2_000, 4_000], [5_000, 9_000], [30_000, 39_000]]) {
    const count = calls.length;
    await advance(delay - 1);
    assert.equal(calls.length, count);
    await advance(1);
    assert.equal(calls.at(-1), expected);
    assert.equal(calls.length, count + 1);
  }
  assert.equal(hub.snapshot(['EXPIRED']).quotes.EXPIRED, undefined);
  assert.deepEqual(Array.from(hub.snapshot(['EXPIRED']).failedSymbols), ['EXPIRED']);
});

test('one released symbol is retained while other consumers remain, without hidden polling', async t => {
  const { createQuoteHub, advance } = recoveryClock(t), calls = [];
  const hub = createQuoteHub(async symbol => { calls.push(symbol); return quote(symbol); });
  let stopA = hub.subscribe(['A'], () => {}), stopB = hub.subscribe(['B'], () => {});
  t.after(() => { stopA(); stopB(); });
  await advance(0); stopA();
  hub.setVisible(false); await advance(10_000);
  stopA = hub.subscribe(['A'], () => {}); await advance(0);
  assert.deepEqual(calls, ['A', 'B']);
  assert.equal(hub.snapshot(['A']).quotes.A.price, 100);
  hub.setVisible(true); await advance(0);
  assert.deepEqual(calls, ['A', 'B']);
  stopA(); stopB(); await advance(60_000);
  assert.deepEqual(calls, ['A', 'B']);
});

test('re-entry preserves transient failure backoff rather than restarting fast recovery', async t => {
  const { createQuoteHub, advance } = recoveryClock(t), calls = [];
  const hub = createQuoteHub(async () => { calls.push(Date.now()); throw new Error('offline', { cause: 'network' }); });
  let stop = hub.subscribe(['A'], () => {}); t.after(() => stop());
  await advance(0); stop(); await advance(500);
  stop = hub.subscribe(['A'], () => {}); await advance(0);
  assert.deepEqual(calls, [1_000]);
  assert.deepEqual(Array.from(hub.snapshot(['A']).failedSymbols), ['A']);
  await advance(500); stop(); await advance(500);
  stop = hub.subscribe(['A'], () => {}); await advance(0);
  assert.deepEqual(calls, [1_000, 2_000]);
  await advance(1_500);
  assert.deepEqual(calls, [1_000, 2_000, 4_000]);
});

test('re-entry and manual refresh cannot bypass a retained 429 deadline or hide its previous-price error', async t => {
  const { createQuoteHub, advance } = recoveryClock(t);
  let calls = 0;
  const confirmed = quote('A');
  const hub = createQuoteHub(async () => {
    calls++;
    if (calls === 2) { const failure = new Error('limited', { cause: 429 }); failure.retryAfterMs = 120_000; throw failure; }
    return confirmed;
  });
  let stop = hub.subscribe(['A'], () => {}); t.after(() => stop());
  await advance(0); await hub.refresh(); stop(); await advance(30_000);
  const previous = hub.snapshot(['A']);
  assert.equal(previous.quotes.A, confirmed);
  assert.deepEqual(Array.from(previous.failedSymbols), ['A']);
  stop = hub.subscribe(['A'], () => {}); await advance(0); await hub.refresh();
  assert.equal(calls, 2);
  hub.setVisible(false); await advance(89_999);
  hub.setVisible(true); await advance(0); assert.equal(calls, 2);
  await advance(1); assert.equal(calls, 3);
  assert.deepEqual(Array.from(hub.snapshot(['A']).failedSymbols), []);
});

test('inactive quote retention is bounded without dropping active holdings or live rate-limit guards', async t => {
  const { createQuoteHub, advance } = recoveryClock(t), calls = [];
  const symbols = Array.from({ length: 300 }, (_, index) => `S${index}`);
  let limited = false;
  const hub = createQuoteHub(async symbol => {
    calls.push(symbol);
    if (limited) throw new Error('limited', { cause: 429 });
    return quote(symbol);
  });
  let stop = hub.subscribe(symbols, () => {}); t.after(() => stop());
  await advance(0);
  assert.equal(Object.keys(hub.snapshot(symbols).quotes).length, 300, 'active holdings are not capped');
  stop();
  assert.equal(Object.keys(hub.snapshot(symbols).quotes).length, 256);
  assert.equal(hub.snapshot(['S0']).quotes.S0, undefined);
  assert.equal(hub.snapshot(['S299']).quotes.S299.price, 100);
  stop = hub.subscribe(symbols, () => {}); await advance(0);
  assert.equal(calls.length, 344, 'only 44 evicted symbols reload');
  limited = true; await hub.refresh(); stop();
  const retained = hub.snapshot(symbols);
  assert.equal(Object.keys(retained.quotes).length, 256);
  assert.equal(retained.failedSymbols.length, 300, 'only minimal guard metadata survives beyond the quote limit');
  assert.equal(hub.snapshot(['S44']).quotes.S44, undefined);
  stop = hub.subscribe(['S44'], () => {}); await advance(0); await hub.refresh();
  assert.equal(calls.length, 644, 'evicting a price never bypasses the rate-limit deadline');
});
