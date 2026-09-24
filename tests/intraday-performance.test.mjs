import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadTypescript } from './load-typescript.mjs';

const { buildIntradayPerformance, loadIntradayPerformance } = loadTypescript('src/features/performance/intraday-performance.ts', {
  '@/lib/stock-api': { getIntradaySeries: () => { throw new Error('No network expected for unknown trade days'); } },
});
const day = '2026-09-22';
const start = Date.parse(`${day}T00:00:00+09:00`);
const tx = (extra = {}) => ({ id: 'buy', symbol: 'AAPL', name: 'Apple', type: 'buy', date: '2026-09-01', quantity: 2, price: 100, fee: 0, currency: 'USD', createdAt: '2026-09-22T12:00:00Z', ...extra });
const input = (extra = {}) => ({ transactions: [tx()], range: '1d', day, currency: 'KRW', ...extra });
const series = (symbol, currency, values, begin = start, step = 60_000) => ({ symbol, currency, interval: step === 60_000 ? '1m' : '30m', startAt: new Date(begin).toISOString(), endAt: new Date(begin + (values.length - 1) * step).toISOString(), fetchedAt: new Date(begin + values.length * step).toISOString(), points: values.map((close, index) => ({ at: new Date(begin + index * step).toISOString(), close, sourceAt: close === null ? null : new Date(begin + index * step - step).toISOString() })) });

test('minute valuation uses historical quantities and each matching FX point, not current holdings or FX', () => {
  const data = { AAPL: series('AAPL', 'USD', [100, 110, 120]), 'USDKRW=X': series('USDKRW=X', 'KRW', [1000, 1100, 900]) };
  const before = JSON.stringify(data);
  const value = buildIntradayPerformance(input(), data, start + 120_000);
  assert.deepEqual(Array.from(value.points, p => p.assetValue), [200000, 242000, 216000]);
  assert.equal(Math.round(value.points[1].portfolioReturn), 21);
  assert.equal(value.profitKRW, 16000);
  assert.equal(JSON.stringify(data), before);
  const usd = buildIntradayPerformance(input({ currency: 'USD' }), data, start + 120_000);
  assert.deepEqual(Array.from(usd.points, p => p.assetValue), [200, 220, 240]);
  assert.equal(usd.points[1].portfolioReturn, value.points[1].portfolioReturn, 'own return stays KRW');
});

test('date-only trade days are gaps, next-day quantities resume, sold cash never remains', () => {
  const begin = start - 4 * 86400000;
  const transactions = [tx({ symbol: '005930.KS', currency: 'KRW' }), tx({ id: 'sale', symbol: '005930.KS', currency: 'KRW', type: 'sell', date: '2026-09-20', price: 200 })];
  const data = { '005930.KS': series('005930.KS', 'KRW', Array(193).fill(200), begin, 1800000) };
  const value = buildIntradayPerformance(input({ transactions, range: '5d' }), data, start);
  assert.equal(value.points[0].assetValue, 400);
  assert.equal(value.points[96].assetValue, null);
  assert.equal(value.points[96].reason, 'trade-time');
  assert.equal(value.points.at(-1).assetValue, 0);
  assert.ok(value.points.every(p => p.portfolioReturn === null));
  assert.equal(value.profitKRW, null);
  assert.deepEqual(Array.from(value.tradeDates), ['2026-09-20']);
});

test('missing prices, FX and wrong currencies never omit a holding or produce zero; genuine no holdings is zero', () => {
  const partial = { AAPL: series('AAPL', 'USD', [100, null, 110]), 'USDKRW=X': series('USDKRW=X', 'KRW', [1000, 1000, null]) };
  const result = buildIntradayPerformance(input(), partial, start + 120000);
  assert.deepEqual(Array.from(result.points, p => p.assetValue), [200000, null, null]);
  assert.equal(result.profitKRW, null);
  assert.equal(result.missingMarketData, true);
  partial.AAPL.currency = 'EUR';
  assert.ok(buildIntradayPerformance(input(), partial, start + 120000).points.every(p => p.assetValue === null));
  const empty = buildIntradayPerformance(input({ transactions: [], currency: 'USD' }), {}, start + 120000);
  assert.ok(empty.points.every(p => p.assetValue === 0 && p.portfolioReturn === null));
  assert.equal(empty.missingMarketData, false);
});

test('pence uses quote unit and missing initial value never rebases a later minute to zero percent', () => {
  const result = buildIntradayPerformance(input({ transactions: [tx({ symbol: 'LLOY.L', currency: 'GBp' })] }), {
    'LLOY.L': series('LLOY.L', 'GBp', [null, 100]), 'GBPKRW=X': series('GBPKRW=X', 'KRW', [2000, 2000]),
  }, start + 60000);
  assert.equal(result.points[1].assetValue, 4000);
  assert.equal(result.points[1].portfolioReturn, null);
  assert.equal(result.profitKRW, null);
});

test('only uncertain trade days require no quote request and createdAt is not execution time', async () => {
  const result = await loadIntradayPerformance(input({ transactions: [tx({ date: day })] }), new AbortController().signal);
  assert.ok(result.points.every(p => p.reason === 'trade-time'));
  assert.ok(result.points.every(p => p.assetValue === null));
});

test('intraday hook scopes values by account, revision, day, range and currency and masks unavailable ledger', () => {
  const input = { user: { id: 'a' }, authLoading: false, revision: 'r1', status: 'ready', transactions: [tx()], day };
  const states = new Map(); let resource;
  const { useIntradayPerformance: readIntraday } = loadTypescript('src/features/performance/use-intraday-performance.ts', {
    '@/hooks/useAuth': { useAuth: () => ({ user: input.user, loading: input.authLoading }) },
    '@/hooks/usePortfolio': { useTransactions: () => input, usePortfolios: () => ({ selectedPortfolioId: 'default' }) },
    '@/shared/time/use-kst-date': { useKstDate: () => input.day },
    '@/features/performance/intraday-performance': { loadIntradayPerformance() {} },
    '@/shared/async/shared-resource': { createSharedResource: (_, empty) => resource = { initial: { value: empty, loading: true, error: null }, snapshot: key => states.get(key) ?? resource.initial, subscribe: () => () => {} } },
    react: { useCallback: cb => cb, useSyncExternalStore: (_, read) => read() },
  });
  const saved = { points: [{ date: 'saved', assetValue: 1 }], tradeDates: [], profitKRW: 1 };
  states.set(JSON.stringify(['a', 'default', 'r1', day, '1d', 'KRW']), { value: saved, loading: false, error: null });
  assert.equal(readIntraday('1d', 'KRW').value, saved);
  for (const change of [{ user: { id: 'b' } }, { revision: 'r2' }, { day: '2026-09-23' }, { status: 'loading' }, { authLoading: true }, { revision: '' }]) {
    Object.assign(input, { user: { id: 'a' }, revision: 'r1', day, status: 'ready', authLoading: false }, change);
    assert.equal(readIntraday('1d', 'KRW').value.points.length, 0);
  }
  Object.assign(input, { revision: 'r1', status: 'ready', authLoading: false });
  assert.equal(readIntraday('5d', 'KRW').value.points.length, 0);
  assert.equal(readIntraday('1d', 'USD').value.points.length, 0);
  Object.assign(input, { revision: '', status: 'failed', error: '거래 기록 연결 실패' });
  assert.equal(readIntraday('1d', 'KRW').loading, false);
  assert.equal(readIntraday('1d', 'KRW').error, '거래 기록 연결 실패');
});

test('intraday axes fit desktop and narrow plots; time zone and date rollover are explicit', () => {
  const { getIntradayDates, getDateLabelPosition, formatIntradayTooltip, DATE_AXIS_HEIGHT } = loadTypescript('src/features/performance/chart-presentation.ts');
  assert.equal(DATE_AXIS_HEIGHT, 36);
  for (const range of ['1d', '5d']) for (const width of [980, 260, 190]) {
    const begin = range === '1d' ? start : start - 4 * 86400000;
    const end = start + 23 * 3600000;
    const axis = getIntradayDates([{ date: new Date(begin).toISOString() }, { date: new Date(end).toISOString() }], width, range);
    assert.ok(axis.ticks.length > 0 && axis.ticks.length <= 6);
    let previous = -Infinity;
    for (const tick of axis.ticks) {
      const label = axis.format(tick);
      const pos = getDateLabelPosition(label, (tick - begin) / (end - begin) * width, 0, width);
      assert.ok(pos.x - pos.width / 2 >= previous + 24);
      assert.ok(pos.x - pos.width / 2 >= 0 && pos.x + pos.width / 2 <= width);
      previous = pos.x + pos.width / 2;
    }
  }
  assert.equal(formatIntradayTooltip(start), '2026.09.22 00:00 KST');
  assert.equal(formatIntradayTooltip(start - 60000), '2026.09.21 23:59 KST');
});

test('intraday screen keeps both chart modes and clear trade/missing/refresh states without invented metrics', () => {
  let state = { value: { points: [{ date: new Date(start).toISOString(), assetValue: 200000, assetValueKRW: 200000, portfolioReturn: 0 }], tradeDates: [], missingMarketData: false, profitKRW: 0 }, loading: false, error: null, day };
  let chart;
  const { IntradayAnalytics } = loadTypescript('src/features/performance/IntradayAnalytics.tsx', {
    '@/features/performance/use-intraday-performance': { useIntradayPerformance: () => state },
    './use-intraday-performance': { useIntradayPerformance: () => state },
    './use-intraday-benchmarks': { useIntradayBenchmarks: () => ({ benchmarks: [], retry() {} }) },
    './Charts': { PORTFOLIO_LINE: { key: 'portfolioReturn', name: '내 수익률', color: 'green' }, AssetChart: p => { chart = p; return null; }, ReturnChart: p => { chart = p; return null; } },
  });
  const draw = mode => renderToStaticMarkup(React.createElement(IntradayAnalytics, { range: '1d', currency: 'KRW', mode, selected: [], focusedSymbol: null, renderComparisons: () => null }));
  assert.match(draw('assets'), /1분.*KST/); assert.equal(chart.intraday, '1d');
  assert.match(draw('assets'), /class="performance-chart-meta"><span class="performance-currency"/);
  assert.match(draw('return'), /내 수익률 KRW 기준/);
  state = { ...state, value: { ...state.value, tradeDates: [day], points: [], profitKRW: null } };
  assert.match(draw('assets'), /거래 시각이 없는 날/); assert.match(draw('return'), /분 단위 수익률은 계산할 수 없습니다/);
  state = { ...state, value: { ...state.value, tradeDates: [], missingMarketData: true } };
  assert.match(draw('assets'), /시세·환율을 확인하지 못한 구간/);
  state = { ...state, error: '연결 실패' }; assert.match(draw('assets'), /role="alert"/);
});

test('intraday and daily chart metadata share typography independently of parent inheritance', () => {
  const css = readFileSync('src/styles/portfolio.css', 'utf8');
  const metadata = css.match(/\.performance-currency\s*\{([^}]+)\}/)?.[1];
  assert.ok(metadata);
  for (const token of ['--cf-font-ui', '--cf-text-caption', '--cf-color-muted', '--cf-leading-label']) {
    assert.ok(metadata.includes(`var(${token})`), token);
  }
  for (const file of ['src/features/performance/IntradayAnalytics.tsx', 'src/components/PerformanceAnalytics.tsx']) {
    const source = readFileSync(file, 'utf8');
    assert.match(source, /className="performance-chart-meta"/);
    assert.match(source, /className="performance-currency"/);
  }
});

test('client validates interval, currency, complete grid, positive price and as-of timestamps', async t => {
  const { getIntradaySeries, marketRequests } = loadTypescript('src/lib/stock-api.ts');
  const valid = series('AAPL', 'USD', [100, null]);
  let response = valid;
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => response }));
  const actual = await getIntradaySeries('AAPL', '1d', day);
  assert.equal(actual.points[1].close, null);
  const cases = [
    { interval: '30m' }, { currency: '' }, { symbol: 'MSFT' }, { points: valid.points.slice(1) },
    { points: [{ ...valid.points[0], close: 0 }, valid.points[1]] },
    { points: [{ ...valid.points[0], sourceAt: new Date(start + 60000).toISOString() }, valid.points[1]] },
  ];
  for (let index = 0; index < cases.length; index++) {
    const symbol = `TEST${index}`;
    response = { ...valid, symbol, ...cases[index] };
    await assert.rejects(getIntradaySeries(symbol, '1d', day), /시간별 시세의 종목·통화·시각/);
  }
  assert.ok(marketRequests);
});
