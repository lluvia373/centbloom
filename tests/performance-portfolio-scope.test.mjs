import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { loadTypescript } from './load-typescript.mjs';

const point = { date: '2020-01-01', assetValueKRW: 100, openingValueKRW: 0,
  twrIndex: 100, netFlowKRW: 100, cumulativeNetFlowKRW: 100, cumulativeProfitKRW: 0,
  active: true, final: true };
const history = { revision: 'workspace-1', startedAt: '2020-01-01T00:00:00Z', points: [point] };

function repositoryFixture() {
  const storage = new Map();
  let client = null;
  const repository = {};
  const imports = {
    '@/lib/supabase': { getSupabaseBrowserClient: () => client },
    '@/lib/branded-storage': { readBrandedStorage: (_, key) => storage.get(key) ?? null },
    '@/lib/project-storage': loadTypescript('src/lib/project-storage.ts'),
    '@/features/auth/session-request': { runSupabaseRequest: () => { throw Error('Unexpected server request'); } },
  };
  const source = ts.transpileModule(readFileSync('src/features/performance/repository.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(source, { exports: repository, require: name => {
    assert.ok(name in imports, name); return imports[name];
  }, Error, Date, JSON, Number, Array, Promise, AbortSignal,
  localStorage: { setItem: (key, value) => storage.set(key, value) } });
  return { ...repository, storage, client: value => { client = value; } };
}

test('portfolio histories are isolated by project/account/portfolio and cannot reuse legacy aggregate data', async () => {
  const f = repositoryFixture(), signal = new AbortController().signal;
  await f.saveHistory('user-a', history, [point], signal);
  await f.saveHistory('user-a', { ...history, portfolioId: 'p-a', points: [{ ...point, assetValueKRW: 40 }] }, [point], signal, 'p-a');
  await f.saveHistory('user-a', { ...history, portfolioId: 'p-b', points: [{ ...point, assetValueKRW: 60 }] }, [point], signal, 'p-b');
  for (const [scope, value] of [['all', 100], ['p-a', 40], ['p-b', 60]]) {
    const result = await f.readHistory('user-a', history.revision, signal, scope);
    assert.equal(result.saved.points[0].assetValueKRW, value);
    assert.equal(result.saved.portfolioId, scope);
  }
  for (const [account, scope] of [['user-b', 'p-a'], [null, 'p-a'], ['user-a', 'missing']])
    assert.equal((await f.readHistory(account, history.revision, signal, scope)).saved, null);
  const scopeKey = [...f.storage.keys()].find(key => key.endsWith(':portfolio:p-a'));
  f.storage.set(scopeKey, JSON.stringify(history));
  assert.equal((await f.readHistory('user-a', history.revision, signal, 'p-a')).saved, null);
  await assert.rejects(f.saveHistory('user-a', { ...history, portfolioId: 'p-b' }, [point], signal, 'p-a'), /일치하지/);
});

test('individual history reads and saves never access or overwrite account-wide server snapshots', async () => {
  const f = repositoryFixture(), signal = new AbortController().signal;
  f.client({ from: () => { throw Error('Unexpected account-wide read'); }, rpc: () => { throw Error('Unexpected account-wide write'); } });
  assert.equal((await f.readHistory('user-a', history.revision, signal, 'p-a')).startedAt, null);
  assert.equal(await f.saveHistory('user-a', { ...history, portfolioId: 'p-a' }, [point], signal, 'p-a'), null);
  const result = await f.readHistory('user-a', history.revision, signal, 'p-a');
  assert.equal(result.saved.serverSynced, false);
  assert.equal(result.saved.points[0].assetValueKRW, 100);
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(f.saveHistory('user-a', { ...history, portfolioId: 'p-b' }, [point], cancelled.signal, 'p-b'), { name: 'AbortError' });
  assert.equal([...f.storage.keys()].some(key => key.endsWith(':portfolio:p-b')), false);
});

test('a selected scope reaches history storage and ignores another scope cached prefix', async () => {
  const { PERFORMANCE_CALCULATION_VERSION } = loadTypescript('src/lib/performance.ts');
  const calls = [], transactions = [{ id: 't1', portfolioId: 'p-a', symbol: 'QA', name: 'QA',
    type: 'buy', date: '2020-01-01', createdAt: history.startedAt, price: 100, quantity: 1,
    fee: 0, currency: 'KRW', fxRateToKRW: 1 }];
  const { loadPerformance } = loadTypescript('src/features/performance/service.ts', {
    './repository': {
      readHistory: async (...args) => { calls.push(['read', ...args]); return { saved: {
        ...history, calculationVersion: PERFORMANCE_CALCULATION_VERSION, portfolioId: 'p-b', serverSynced: true,
      }, startedAt: history.startedAt }; },
      saveHistory: async (...args) => { calls.push(['save', ...args]); return null; },
    },
    './calculate': { calculateHistory: async input => { assert.equal(input.previousPoints.length, 0); return [point]; } },
    '@/lib/stock-api': { getChartSeries: async () => ({ points: [{ date: '2019-12-31', close: 100 }] }) },
  });
  const signal = new AbortController().signal;
  await loadPerformance({ userId: 'user-a', portfolioId: 'p-a', revision: history.revision, transactions, today: '2020-04-10' }, signal);
  assert.equal(calls[0][4], 'p-a');
  assert.equal(calls[1][2].portfolioId, 'p-a');
  assert.equal(calls[1][5], 'p-a');
});

test('intraday scope hides previous portfolio/account results immediately and passes selected transactions only', () => {
  const input = { user: { id: 'user-a' }, selectedPortfolioId: 'p-a', transactions: [{ id: 'selected' }],
    revision: 'r1', status: 'ready', authLoading: false };
  const states = new Map(), subscriptions = [];
  let resource;
  const { useIntradayPerformance } = loadTypescript('src/features/performance/use-intraday-performance.ts', {
    '@/hooks/useAuth': { useAuth: () => ({ user: input.user, loading: input.authLoading }) },
    '@/hooks/usePortfolio': { useTransactions: () => input, usePortfolios: () => input },
    '@/shared/time/use-kst-date': { useKstDate: () => '2020-04-10' },
    './intraday-performance': { loadIntradayPerformance: () => { throw Error('No network'); } },
    '@/shared/async/shared-resource': { createSharedResource: (_, empty) => resource = {
      initial: { value: empty, loading: true, error: null },
      snapshot: key => states.get(key) ?? resource.initial,
      subscribe: (key, request) => { subscriptions.push({ key, request }); return () => {}; },
    } },
    react: { useCallback: callback => callback, useSyncExternalStore: (subscribe, snapshot) => { subscribe(() => {}); return snapshot(); } },
  });
  const result = { points: [{ date: '2020-04-10T01:00:00Z', assetValueKRW: 40 }] };
  const key = JSON.stringify(['user-a', 'p-a', 'r1', '2020-04-10', '1d', 'KRW']);
  states.set(key, { value: result, loading: false, error: null });
  assert.equal(useIntradayPerformance('1d', 'KRW').value, result);
  assert.equal(subscriptions.at(-1).request.transactions, input.transactions);
  for (const scope of ['p-b', 'all']) {
    input.selectedPortfolioId = scope;
    assert.equal(useIntradayPerformance('1d', 'KRW').value.points.length, 0);
  }
  input.selectedPortfolioId = 'p-a'; input.user = { id: 'other' };
  assert.equal(useIntradayPerformance('1d', 'KRW').value.points.length, 0);
  input.user = null;
  assert.equal(useIntradayPerformance('1d', 'KRW').value.points.length, 0);
});

test('aggregate daily/monthly/yearly amounts equal portfolio sums after a different-cost same-symbol partial sale', () => {
  const { buildDailyPerformance } = loadTypescript('src/lib/performance.ts');
  const { buildPeriodSummaries } = loadTypescript('src/features/performance/period-summary.ts');
  const tx = (id, portfolioId, date, type, price, quantity) => ({ id, portfolioId, date, type, price, quantity,
    symbol: 'QA', name: 'QA', createdAt: date + 'T00:00:00Z', fee: 0, currency: 'KRW', fxRateToKRW: 1 });
  const a = [tx('a-buy', 'p-a', '2020-01-01', 'buy', 100, 10), tx('a-sale', 'p-a', '2020-02-02', 'sell', 300, 5)];
  const b = [tx('b-buy', 'p-b', '2020-01-02', 'buy', 200, 10)];
  const calculate = transactions => buildDailyPerformance({ transactions, trackingStartDate: '2020-01-01',
    endDate: '2020-02-03', pricesBySymbol: { QA: [{ date: '2020-01-01', close: 100 }, { date: '2020-01-02', close: 200 }, { date: '2020-02-02', close: 300 }] }, fxByCurrency: {}, strict: true });
  const pa = calculate(a), pb = calculate(b), all = calculate([...a, ...b]);
  for (let i = 0; i < all.length; i++) for (const field of ['assetValueKRW', 'openingValueKRW', 'netFlowKRW', 'cumulativeNetFlowKRW', 'cumulativeProfitKRW'])
    assert.equal(all[i][field], pa[i][field] + pb[i][field], `${all[i].date} ${field}`);
  for (const granularity of ['month', 'year']) {
    const sa = buildPeriodSummaries(pa, a, granularity), sb = buildPeriodSummaries(pb, b, granularity);
    buildPeriodSummaries(all, [...a, ...b], granularity).forEach((row, i) => {
      assert.equal(row.profitKRW, sa[i].profitKRW + sb[i].profitKRW);
      assert.ok(Number.isFinite(row.securitiesReturn));
    });
  }
});
