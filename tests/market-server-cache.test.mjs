import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescript } from './load-typescript.mjs';

const { createRequestCache } = loadTypescript('src/shared/async/request-cache.ts');
class MarketError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}
const row = (at, close = 100) => ({ date: new Date(at), open: close, high: close, low: close, close });
const chart = (symbol, interval, quotes = [row('2026-09-18T13:30Z')]) => ({
  meta: { symbol, currency: 'USD', dataGranularity: interval, instrumentType: 'EQUITY' }, quotes,
});
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
function server(module, handler = (symbol, options) => chart(symbol, options.interval), now = Date.now) {
  const calls = [];
  const provider = {
    MarketError,
    validSymbol: symbol => /^[A-Za-z0-9.^=_-]{1,40}$/.test(symbol),
    validDate: day => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) &&
      new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day,
    providerRequests: createRequestCache({ concurrency: 4, now }),
    yahoo: { chart: async (symbol, options, { fetchOptions: { signal } }) => {
      calls.push({ symbol, options, signal });
      return handler(symbol, options, signal);
    } },
  };
  return { calls, ...loadTypescript(`src/features/market/server/${module}.ts`, { './provider': provider }) };
}

test('equivalent explicit chart ranges and normalized symbols make one provider call, including reuse after completion', async () => {
  const s = server('chart');
  const [first, second] = await Promise.all([
    s.fetchChart(' aapl ', '1mo', '2026-09-01', '2026-09-18'),
    s.fetchChart('AAPL', '5y', '2026-09-01', '2026-09-18'),
  ]);
  const third = await s.fetchChart('aapl', '6mo', '2026-09-01', '2026-09-18');
  assert.equal(s.calls.length, 1);
  assert.equal(first, second);
  assert.equal(second, third);
  assert.equal(first.symbol, 'AAPL');
  assert.equal(s.calls[0].symbol, 'AAPL');
  assert.equal(s.calls[0].options.period1, '2026-09-01');
  assert.equal(s.calls[0].options.period2, '2026-09-19');
  assert.equal(s.calls[0].options.interval, '1d');
});

test('relative and explicit chart requests share only identical provider windows and sampling intervals', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-09-21T12:00Z') });
  const s = server('chart');
  await s.fetchChart('AAPL', '1mo', null, null);
  await s.fetchChart('aapl', '5y', '2026-08-22', null);
  assert.equal(s.calls.length, 1);
  await s.fetchChart('AAPL', '3mo', null, null);
  await s.fetchChart('AAPL', '3mo', '2026-06-23', null);
  assert.equal(s.calls.length, 3);
  assert.equal(s.calls[1].options.interval, '1wk');
  assert.equal(s.calls[2].options.interval, '1d');
  await s.fetchChart('AAPL', '1mo', '2026-08-22', '2026-09-20');
  assert.equal(s.calls.length, 4);
  assert.equal(s.calls[0].options.period2, undefined);
  assert.equal(s.calls[3].options.period2, '2026-09-21');
});

test('relative chart windows roll over at UTC midnight even while the previous cache entry is fresh', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-09-21T23:59:59.900Z') });
  const s = server('chart');
  await s.fetchChart('AAPL', '1mo', null, null);
  t.mock.timers.tick(200);
  await s.fetchChart('AAPL', '1mo', null, null);
  assert.equal(s.calls.length, 2);
  assert.deepEqual(s.calls.map(c => c.options.period1), ['2026-08-22', '2026-08-23']);
});

test('canonical chart requests retain the one-minute TTL and retry failures', async () => {
  let clock = 0;
  let fail = true;
  const s = server('chart', (symbol, options) => {
    if (fail) throw new Error('provider unavailable');
    return chart(symbol, options.interval);
  }, () => clock);
  await assert.rejects(s.fetchChart('aapl', '1mo', '2026-09-01', '2026-09-18'), /provider unavailable/);
  fail = false;
  await s.fetchChart('AAPL', '5y', '2026-09-01', '2026-09-18');
  clock = 59_999;
  await s.fetchChart('AAPL', '6mo', '2026-09-01', '2026-09-18');
  assert.equal(s.calls.length, 2);
  clock = 60_000;
  await s.fetchChart('AAPL', '6mo', '2026-09-01', '2026-09-18');
  assert.equal(s.calls.length, 3);
});

test('cancelling one canonical chart subscriber preserves the other subscriber and the shared provider request', async () => {
  const gate = deferred();
  const started = deferred();
  const s = server('chart', async (symbol, options) => {
    started.resolve();
    await gate.promise;
    return chart(symbol, options.interval);
  });
  const abort = new AbortController();
  const first = s.fetchChart('aapl', '1mo', '2026-09-01', null, abort.signal);
  const second = s.fetchChart('AAPL', '5y', '2026-09-01', null);
  await started.promise;
  abort.abort();
  await assert.rejects(first, error => error.name === 'AbortError');
  assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0].signal.aborted, false);
  gate.resolve();
  assert.equal((await second).points[0].close, 100);
});

test('historical symbols share requests without merging dates or extending the five-minute TTL', async () => {
  let clock = 0;
  const s = server('historical', (symbol, options) => chart(symbol, options.interval, [row(`${options.period1}T13:30Z`)]), () => clock);
  const [first, second] = await Promise.all([
    s.fetchHistorical(' aapl ', '2026-09-18'), s.fetchHistorical('AAPL', '2026-09-18'),
  ]);
  assert.equal(first, second);
  assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0].symbol, 'AAPL');
  assert.equal(s.calls[0].options.period2, '2026-09-19');
  clock = 299_999;
  await s.fetchHistorical('aapl', '2026-09-18');
  assert.equal(s.calls.length, 1);
  await s.fetchHistorical('aapl', '2026-09-17');
  assert.equal(s.calls.length, 2);
  clock = 300_000;
  await s.fetchHistorical('aapl', '2026-09-18');
  assert.equal(s.calls.length, 3);
});

test('intraday auxiliary requests reuse the same minute across calls while preserving actual query times and fresh result timestamps', async () => {
  const firstNow = Date.parse('2026-09-21T14:31:10.123Z');
  const latestNow = Date.parse('2026-09-21T14:31:40.987Z');
  const s = server('intraday', (symbol, options) => chart(symbol, options.interval, options.interval === '1d'
    ? [row('2026-09-18T13:30Z', 90)]
    : [row('2026-09-21T14:00Z', 101), row('2026-09-21T14:30Z', 999), row('2026-09-21T15:00Z', 888)]));
  const [first, second] = await Promise.all([
    s.fetchIntradayChart(' aapl ', '5d', '2026-09-21', undefined, firstNow),
    s.fetchIntradayChart('AAPL', '5d', '2026-09-21', undefined, latestNow),
  ]);
  const third = await s.fetchIntradayChart('aapl', '5d', '2026-09-21', undefined, latestNow + 1);
  assert.equal(s.calls.length, 2);
  assert.equal(s.calls.filter(c => c.options.interval === '1d').length, 1);
  assert.equal(s.calls.find(c => c.options.interval === '1d').options.period2.getTime(), firstNow);
  assert.equal(s.calls.find(c => c.options.interval === '30m').options.period2.getTime(), Date.parse('2026-09-21T14:30Z') + 1);
  assert.equal(s.calls.find(c => c.options.interval === '1d').options.period1.getTime(), Date.parse('2026-09-16T15:00Z') - 40 * 86_400_000);
  assert.equal(first.fetchedAt, new Date(firstNow).toISOString());
  assert.equal(second.fetchedAt, new Date(latestNow).toISOString());
  assert.equal(third.fetchedAt, new Date(latestNow + 1).toISOString());
  assert.equal(third.endAt, '2026-09-21T14:30:00.000Z');
  assert.equal(third.points.at(-1).close, 101);
  assert.ok(third.points.every(p => p.close !== 999 && p.close !== 888));
});

test('a session-close minute refetches daily data before it becomes eligible, never promoting a cached partial close', async () => {
  const closeAt = Date.parse('2026-09-21T20:00Z');
  const before = closeAt - 100;
  const after = closeAt + 100;
  const s = server('intraday', (symbol, options) => chart(symbol, options.interval, options.interval === '1d'
    ? [row('2026-09-21T13:30Z', options.period2.getTime() < closeAt ? 111 : 222)]
    : [row('2026-09-21T19:58Z', 100), row('2026-09-21T20:00Z', 999)]));
  const first = await s.fetchIntradayChart('AAPL', '1d', '2026-09-22', undefined, before);
  const second = await s.fetchIntradayChart('AAPL', '1d', '2026-09-22', undefined, after);
  assert.equal(s.calls.length, 4);
  assert.equal(first.points.at(-1).close, 100);
  assert.equal(second.points.at(-1).close, 222);
  assert.equal(second.endAt, '2026-09-21T20:00:00.000Z');
  assert.ok(second.points.every(p => p.close !== 111 && p.close !== 999));
  assert.deepEqual(s.calls.filter(c => c.options.interval === '1d').map(c => c.options.period2.getTime()), [before, after]);
});

test('failed intraday leaves retry at the same minute; cancelling the last subscriber aborts both leaves', async () => {
  const now = Date.parse('2026-09-21T14:31:10.123Z');
  let fail = true;
  const s = server('intraday', (symbol, options) => {
    if (fail) throw new Error('provider unavailable');
    return chart(symbol, options.interval);
  });
  await assert.rejects(s.fetchIntradayChart('AAPL', '5d', '2026-09-21', undefined, now), error => error.status === 503);
  fail = false;
  await s.fetchIntradayChart('AAPL', '5d', '2026-09-21', undefined, now + 1);
  assert.equal(s.calls.length, 4);

  const started = deferred();
  let active = 0;
  const cancelled = server('intraday', (_symbol, _options, signal) => new Promise((_, reject) => {
    if (++active === 2) started.resolve();
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }));
  const abort = new AbortController();
  const pending = cancelled.fetchIntradayChart('AAPL', '5d', '2026-09-21', abort.signal, now);
  await started.promise;
  abort.abort();
  await assert.rejects(pending, error => error.name === 'AbortError');
  assert.equal(cancelled.calls.length, 2);
  assert.ok(cancelled.calls.every(c => c.signal.aborted));
});
