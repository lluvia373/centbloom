import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { loadTypescript } from './load-typescript.mjs';

const day = '2026-09-22';
const series = symbol => ({ symbol, currency: 'USD', interval: '1m', startAt: `${day}T00:00:00+09:00`,
  endAt: `${day}T12:00:00+09:00`, fetchedAt: `${day}T12:00:00+09:00`,
  points: [{ at: `${day}T10:00:00+09:00`, close: 100, sourceAt: `${day}T09:59:00+09:00` }] });

function harness(react) {
  const requests = [];
  const benchmarkModule = loadTypescript('src/features/performance/use-intraday-benchmarks.ts', {
    '@/lib/stock-api': { getIntradaySeries: (symbol, range, day, signal) =>
      new Promise((resolve, reject) => requests.push({ symbol, range, day, signal, resolve, reject })) },
    ...(react ? { react } : {}),
  });
  return { ...benchmarkModule, requests };
}

test('adding, removing and reordering intraday references preserve unrelated completed and pending series', async t => {
  const h = harness(); const store = h.createIntradayBenchmarkStore(); t.after(() => store.dispose());
  store.select([' voo ', 'VOO', 'QQQ'], '1d', day);
  assert.deepEqual(h.requests.map(r => r.symbol), ['VOO', 'QQQ']);
  const completed = series('VOO'); h.requests[0].resolve(completed); await setImmediate();
  store.select(['QQQ', 'VOO', 'DIA'], '1d', day);
  assert.deepEqual(h.requests.map(r => r.symbol), ['VOO', 'QQQ', 'DIA']);
  assert.equal(store.snapshot().entries.get('VOO').series, completed);
  assert.equal(h.requests[1].signal.aborted, false);
  const unchanged = store.snapshot(); store.select(['DIA', 'VOO', 'QQQ'], '1d', day);
  assert.equal(store.snapshot(), unchanged);
  store.select(['VOO', 'DIA'], '1d', day);
  assert.equal(h.requests[1].signal.aborted, true);
  assert.equal(h.requests[2].signal.aborted, false);
  h.requests[1].resolve(series('QQQ')); await setImmediate();
  assert.equal(store.snapshot().entries.has('QQQ'), false);
});

test('one public series is shared across views and only its final removal aborts it', async t => {
  const h = harness(); const a = h.createIntradayBenchmarkStore(), b = h.createIntradayBenchmarkStore();
  t.after(() => { a.dispose(); b.dispose(); });
  a.select(['VOO'], '1d', day); b.select(['VOO'], '1d', day);
  assert.equal(h.requests.length, 1);
  a.dispose(); assert.equal(h.requests[0].signal.aborted, false);
  b.dispose(); assert.equal(h.requests[0].signal.aborted, true);
  h.requests[0].resolve(series('VOO')); await setImmediate();
  assert.equal(a.snapshot().entries.size, 0); assert.equal(b.snapshot().entries.size, 0);
  b.select(['VOO'], '1d', day); assert.equal(h.requests.length, 2);
});

test('range or KST day changes discard previous scope and ignore late results', async t => {
  const h = harness(); const store = h.createIntradayBenchmarkStore(); t.after(() => store.dispose());
  store.select(['VOO'], '1d', day);
  store.select(['VOO'], '5d', day);
  assert.equal(h.requests[0].signal.aborted, true);
  assert.equal(h.requests[1].range, '5d');
  h.requests[0].resolve(series('VOO')); await setImmediate();
  assert.equal(store.snapshot().entries.get('VOO').series, null);
  store.select(['VOO'], '5d', '2026-09-23');
  assert.equal(h.requests[1].signal.aborted, true);
  assert.equal(h.requests[2].day, '2026-09-23');
  store.select(['VOO'], '5d', '');
  assert.equal(h.requests[2].signal.aborted, true);
  assert.equal(store.snapshot().entries.size, 0);
  store.retry('VOO'); assert.equal(h.requests.length, 3);
});

test('60 second shared refresh preserves other references, failure evidence and one retry across views', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness(); const a = h.createIntradayBenchmarkStore(), b = h.createIntradayBenchmarkStore();
  t.after(() => { a.dispose(); b.dispose(); });
  a.select(['VOO', 'QQQ'], '1d', day); b.select(['VOO'], '1d', day);
  const completed = series('VOO'); h.requests[0].resolve(completed); await setImmediate();
  t.mock.timers.tick(59_999); assert.equal(h.requests.length, 2);
  t.mock.timers.tick(1); assert.equal(h.requests.length, 3);
  assert.equal(h.requests[2].symbol, 'VOO');
  assert.equal(a.snapshot().entries.get('VOO').series, completed);
  h.requests[2].reject(new Error('분 시세 조회 실패')); await setImmediate();
  assert.equal(b.snapshot().entries.get('VOO').error, '분 시세 조회 실패');
  a.retry('VOO'); b.retry('VOO'); assert.equal(h.requests.length, 4);
  assert.equal(a.snapshot().entries.get('VOO').error, '분 시세 조회 실패');
  assert.equal(h.requests[1].signal.aborted, false);
  const recovered = { ...completed, points: [{ ...completed.points[0], close: 105 }] };
  h.requests[3].resolve(recovered); await setImmediate();
  assert.equal(a.snapshot().entries.get('VOO').error, null);
  assert.equal(b.snapshot().entries.get('VOO').series, recovered);
  a.dispose(); b.dispose(); t.mock.timers.tick(120_000);
  assert.equal(h.requests.length, 4); assert.equal(h.requests[1].signal.aborted, true);
});

test('intraday hook masks previous range and day before synchronization effects', async t => {
  let store; let effects = [];
  const h = harness({
    useState: initialize => [store ??= initialize()],
    useMemo: compute => compute(),
    useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
    useEffect: effect => { effects.push(effect); },
  });
  t.after(() => store.dispose());
  let state = h.useIntradayBenchmarks(['VOO'], '1d', day);
  assert.equal(state.benchmarks[0].loading, true);
  effects.splice(0).forEach(effect => effect());
  h.requests[0].resolve(series('VOO')); await setImmediate();
  state = h.useIntradayBenchmarks(['VOO'], '1d', day);
  assert.equal(state.benchmarks[0].loading, false);
  for (const [range, date] of [['5d', day], ['1d', '2026-09-23']]) {
    state = h.useIntradayBenchmarks(['VOO'], range, date);
    assert.equal(state.benchmarks[0].series, null); assert.equal(state.benchmarks[0].loading, true);
  }
  assert.equal(h.useIntradayBenchmarks(['VOO'], '1d', '').benchmarks.length, 0);
});
