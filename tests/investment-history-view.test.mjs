import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadTypescript } from './load-typescript.mjs';

const nodes = value => Array.isArray(value) ? value.flatMap(nodes)
  : React.isValidElement(value) ? [value, ...nodes(value.props.children)] : [];

function historyHarness(overrides = {}) {
  const input = {
    history: {
      points: [], loading: false, error: null, refreshError: null,
      scopeKey: '["account-a","revision-a","2026-09-22"]',
      ...overrides,
    },
    transactions: [{ id: 'buy-a', date: '2024-01-01' }],
  };
  const calls = [];
  const Table = props => {
    calls.push(props);
    return React.createElement('div', { 'data-test': 'period-table' });
  };
  const { InvestmentHistory } = loadTypescript('src/features/performance/InvestmentHistory.tsx', {
    '@/hooks/usePerformanceHistory': { usePerformanceHistory: () => input.history },
    '@/hooks/usePortfolio': { useTransactions: () => ({ transactions: input.transactions }) },
    './PerformanceTable': { PerformanceTable: Table },
  });
  let tree;
  return {
    input, calls,
    draw() {
      tree = InvestmentHistory();
      return renderToStaticMarkup(tree);
    },
    table() { return nodes(tree).find(node => node.type === Table); },
  };
}

test('history waits for scoped initial data without rendering an empty or zero result', () => {
  const h = historyHarness({ loading: true });
  const html = h.draw();
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /role="status">성과 불러오는 중/);
  assert.doesNotMatch(html, /성과 기록 없음|성과 조회 실패|period-table|0%|₩0/);
  assert.equal(h.calls.length, 0);
});

test('initial history or ledger failure shows the error instead of an empty portfolio', () => {
  const h = historyHarness({ error: '거래 기록을 불러오지 못했습니다.', refreshError: '거래 기록을 불러오지 못했습니다.' });
  const html = h.draw();
  assert.match(html, /성과 조회 실패/);
  assert.match(html, /role="alert"[^>]*>거래 기록을 불러오지 못했습니다\./);
  assert.doesNotMatch(html, /성과 기록 없음|period-table/);
  assert.equal(h.calls.length, 0);
});

test('an initial retry keeps the failure visible while no complete result exists', () => {
  const h = historyHarness({ loading: true, error: '시장 조회 실패', refreshError: '시장 조회 실패' });
  const html = h.draw();
  assert.match(html, /성과 불러오는 중/);
  assert.match(html, /role="alert"[^>]*>시장 조회 실패/);
  assert.doesNotMatch(html, /이전 결과|period-table|성과 기록 없음/);
});

test('a completed empty history shows no record without fabricating table values', () => {
  const h = historyHarness();
  h.input.transactions = [];
  const html = h.draw();
  assert.match(html, /aria-busy="false"/);
  assert.match(html, /성과 기록 없음/);
  assert.doesNotMatch(html, /role="alert"|period-table|0%|₩0/);
  assert.equal(h.calls.length, 0);
});

test('the embedded table receives full original history and transactions unchanged', () => {
  const points = [{ date: '2024-01-01' }, { date: '2026-09-22' }];
  const h = historyHarness({ points });
  const html = h.draw();
  assert.match(html, /period-table/);
  assert.equal(h.table().key, h.input.history.scopeKey);
  assert.equal(h.calls[0].points, points);
  assert.equal(h.calls[0].transactions, h.input.transactions);
  assert.equal(h.calls[0].embedded, true);
  assert.doesNotMatch(html, /성과 기록 없음|성과 불러오는 중|role="alert"|이전 결과/);
});

test('same-scope refresh failure retains results and keeps warning through retries', () => {
  const points = [{ date: '2026-09-22' }];
  const h = historyHarness({ points, error: '시장 조회 실패', refreshError: '시장 조회 실패' });
  for (const loading of [false, true]) {
    h.input.history.loading = loading;
    const html = h.draw();
    assert.match(html, /갱신하지 못해 이전 결과를 표시합니다\./);
    assert.match(html, /role="status"/);
    assert.match(html, /period-table/);
    assert.equal(h.table().props.points, points);
    assert.doesNotMatch(html, /성과 조회 실패|성과 기록 없음/);
  }
  h.input.history = { ...h.input.history, loading: false, error: null, refreshError: null };
  assert.doesNotMatch(h.draw(), /이전 결과|role="alert"/);
});

test('a completed calculation with a storage warning remains visible and is not labelled stale', () => {
  const h = historyHarness({ points: [{ date: '2026-09-22' }], error: '성과 기록을 저장하지 못했습니다.' });
  const html = h.draw();
  assert.match(html, /period-table/);
  assert.match(html, /role="alert"[^>]*>성과 기록을 저장하지 못했습니다\./);
  assert.doesNotMatch(html, /갱신하지 못해|성과 조회 실패/);
});

test('account revision and date changes never reuse a previous table or pagination key', () => {
  const h = historyHarness({ points: [{ date: '2026-09-22', assetValueKRW: 123 }] });
  h.draw();
  const oldKey = h.table().key;
  for (const scopeKey of [
    '["account-b","revision-b","2026-09-22"]',
    '["account-b","revision-c","2026-09-22"]',
    '["account-b","revision-c","2026-09-23"]',
  ]) {
    // The hook exposes an empty snapshot until this new immutable key resolves.
    h.input.history = { points: [], loading: true, error: null, refreshError: null, scopeKey };
    h.input.transactions = [{ id: scopeKey }];
    assert.doesNotMatch(h.draw(), /period-table|이전 결과/);
    assert.equal(h.table(), undefined);
    h.input.history = { ...h.input.history, loading: false, error: '새 조건 조회 실패', refreshError: '새 조건 조회 실패' };
    assert.doesNotMatch(h.draw(), /period-table|이전 결과/);
    h.input.history = { ...h.input.history, points: [{ date: '2026-09-23' }], error: null, refreshError: null };
    h.draw();
    assert.equal(h.table().key, scopeKey);
    assert.notEqual(h.table().key, oldKey);
    assert.equal(h.table().props.transactions, h.input.transactions);
  }
});
