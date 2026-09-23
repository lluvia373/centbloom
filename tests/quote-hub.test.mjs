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
