import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadTypescript } from './load-typescript.mjs';

const summary = (key, overrides = {}) => ({
  key, startDate: `${key}-01`, endDate: `${key}-28`, profitKRW: 1000,
  securitiesReturn: 1, inactive: false, complete: true, ...overrides,
});
const months = (count = 14) => Array.from({ length: count }, (_, index) => {
  const date = new Date(Date.UTC(2026, 11 - index, 1));
  return summary(date.toISOString().slice(0, 7));
});
const nodes = value => Array.isArray(value) ? value.flatMap(nodes)
  : React.isValidElement(value) ? [value, ...nodes(value.props.children)] : [];

// Test real callbacks and markup; calendar calculation has its own pure-module tests.
function tableHarness(month = months(), year = []) {
  const state = [];
  let cursor = 0;
  let tree;
  const input = { month, year, points: [{ date: '2026-01-01' }], transactions: [{ id: 'buy' }] };
  const calls = [];
  const { PerformanceTable } = loadTypescript('src/features/performance/PerformanceTable.tsx', {
    react: {
      ...React,
      useMemo: compute => compute(),
      useState: initial => {
        const index = cursor++;
        if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
        return [state[index], value => {
          state[index] = typeof value === 'function' ? value(state[index]) : value;
        }];
      },
    },
    './period-summary': { buildPeriodSummaries: (points, transactions, granularity) => {
      calls.push({ points, transactions, granularity });
      return input[granularity];
    } },
  });
  const find = predicate => {
    const node = nodes(tree).find(predicate);
    assert.ok(node, 'Expected table UI element');
    return node;
  };
  return {
    input, calls,
    draw() {
      cursor = 0;
      tree = PerformanceTable(input);
      return renderToStaticMarkup(tree);
    },
    button(label) {
      return find(node => node.type === 'button'
        && (node.props.children === label || node.props['aria-label'] === label));
    },
    click(label) {
      const button = this.button(label);
      assert.ok(!button.props.disabled, `Cannot click disabled button: ${label}`);
      button.props.onClick();
    },
    rows() { return nodes(find(node => node.type === 'tbody')).filter(node => node.type === 'tr'); },
    header() { return find(node => node.props.className === 'performance-history-header'); },
  };
}

test('performance table defaults to the latest six months and receives the original history', () => {
  const h = tableHarness();
  const html = h.draw();
  assert.equal(h.rows().length, 6);
  assert.deepEqual(h.rows().map(row => row.key), months(6).map(row => row.key));
  assert.equal(h.button('월별').props['aria-pressed'], true);
  assert.equal(h.button('연도별').props['aria-pressed'], false);
  assert.equal(h.calls[0].points, h.input.points);
  assert.equal(h.calls[0].transactions, h.input.transactions);
  assert.equal(h.calls[0].granularity, 'month');
  assert.match(html, /<th scope="col">기간<\/th><th scope="col">투자손익<\/th><th scope="col">수익률<\/th>/);
  assert.match(html, /<caption[^>]*>월별 투자 성과 · 전체 기간 · 원화 기준<\/caption>/);
  assert.doesNotMatch(html, /2026년 6월/);
});

test('performance table pages backward and forward without skipping or repeating periods', () => {
  const h = tableHarness();
  assert.match(h.draw(), />1 \/ 3<\/span>/);
  assert.equal(h.button('최근 기간 보기').props.disabled, true);
  assert.equal(h.button('이전 기간 보기').props.disabled, false);
  const seen = h.rows().map(row => row.key);
  h.click('이전 기간 보기');
  assert.match(h.draw(), />2 \/ 3<\/span>/);
  assert.equal(h.button('최근 기간 보기').props.disabled, false);
  seen.push(...h.rows().map(row => row.key));
  h.click('이전 기간 보기');
  assert.match(h.draw(), />3 \/ 3<\/span>/);
  assert.equal(h.rows().length, 2);
  assert.equal(h.button('이전 기간 보기').props.disabled, true);
  seen.push(...h.rows().map(row => row.key));
  assert.deepEqual(seen, months().map(row => row.key));
  h.click('최근 기간 보기');
  assert.match(h.draw(), />2 \/ 3<\/span>/);
  assert.deepEqual(h.rows().map(row => row.key), months().slice(6, 12).map(row => row.key));
});

test('monthly and yearly switches reset pagination while retaining the same common controls', () => {
  const years = Array.from({ length: 9 }, (_, index) => summary(String(2026 - index)));
  const h = tableHarness(months(), years);
  h.draw();
  const controls = () => renderToStaticMarkup(h.header()).replace(/aria-pressed="(?:true|false)"/g, '');
  const header = controls();
  h.click('이전 기간 보기'); h.draw();
  h.click('이전 기간 보기'); h.draw();
  h.click('연도별');
  const yearly = h.draw();
  assert.match(yearly, />1 \/ 2<\/span>/);
  assert.match(yearly, /<caption[^>]*>연도별 투자 성과/);
  assert.equal(h.button('연도별').props['aria-pressed'], true);
  assert.equal(controls(), header);
  assert.deepEqual(h.rows().map(row => row.key), years.slice(0, 6).map(row => row.key));
  assert.doesNotMatch(renderToStaticMarkup(h.rows()[0]), /2026년 \d+월/);
  h.click('이전 기간 보기'); h.draw();
  h.click('월별');
  assert.match(h.draw(), />1 \/ 3<\/span>/);
  assert.equal(controls(), header);
});

test('pagination clamps to an existing page after history shrinks', () => {
  const h = tableHarness();
  h.draw(); h.click('이전 기간 보기'); h.draw(); h.click('이전 기간 보기'); h.draw();
  h.input.month = months(8);
  assert.match(h.draw(), />2 \/ 2<\/span>/);
  assert.deepEqual(h.rows().map(row => row.key), months(8).slice(6).map(row => row.key));
  assert.equal(h.button('이전 기간 보기').props.disabled, true);
  h.click('최근 기간 보기');
  assert.match(h.draw(), />1 \/ 2<\/span>/);
  h.input.month = months(3);
  assert.doesNotMatch(h.draw(), /투자 성과 페이지/);
  assert.equal(h.rows().length, 3);
});

test('empty history adds no panel and one page adds no unnecessary navigation', () => {
  assert.equal(tableHarness([]).draw(), '');
  const h = tableHarness(months(6));
  const html = h.draw();
  assert.equal(h.rows().length, 6);
  assert.doesNotMatch(html, /<nav|최근 기간 보기|이전 기간 보기/);
  assert.doesNotMatch(html, /<details|<summary|aria-expanded|더 보기|접기|펼치기/);
});

test('partial first and current periods show their covered dates without marking full periods', () => {
  const h = tableHarness([
    summary('2026-09', { startDate: '2026-09-01', endDate: '2026-09-22', complete: false }),
    summary('2026-08'),
    summary('2026-07', { startDate: '2026-07-05', endDate: '2026-07-31', complete: false }),
  ], [summary('2026', { startDate: '2026-07-05', endDate: '2026-09-22', complete: false })]);
  const html = h.draw();
  assert.match(html, /9\. 1\. – 9\. 22\./);
  assert.match(html, /7\. 5\. – 7\. 31\./);
  assert.equal((html.match(/class="performance-history-coverage"/g) || []).length, 2);
  assert.doesNotMatch(renderToStaticMarkup(h.rows()[1]), /performance-history-coverage/);
  h.click('연도별');
  assert.match(h.draw(), /7\. 5\. – 9\. 22\./);
});

test('profit remains in KRW and visible rounding determines positive negative and zero tones', () => {
  const h = tableHarness([
    summary('2026-09', { profitKRW: 1234.6, securitiesReturn: 1.236 }),
    summary('2026-08', { profitKRW: -1234.6, securitiesReturn: -1.236 }),
    summary('2026-07', { profitKRW: -0.1, securitiesReturn: -0.001 }),
    summary('2026-06', { profitKRW: 0.1, securitiesReturn: 0.001 }),
  ]);
  const html = h.draw();
  const rows = h.rows().map(row => renderToStaticMarkup(row));
  assert.match(html, /전체 기간 · 원화 기준/);
  assert.match(rows[0], /class="text-cf-market-up">\+₩1,235<\/td>/);
  assert.match(rows[0], /class="text-cf-market-up">\+1\.24%<\/td>/);
  assert.match(rows[1], /class="text-cf-market-down">-₩1,235<\/td>/);
  assert.match(rows[1], /class="text-cf-market-down">-1\.24%<\/td>/);
  for (const row of rows.slice(2)) {
    assert.match(row, /class="text-cf-ink">₩0<\/td>/);
    assert.match(row, /class="text-cf-ink">0\.00%<\/td>/);
    assert.doesNotMatch(row, /market-up|market-down|[+-]0\.00%|[+-]₩0/);
  }
  assert.doesNotMatch(html, /USD|US\$|\$1,235/);
});

test('inactive periods and missing or nonfinite results are distinct from zero performance', () => {
  const h = tableHarness([
    summary('2026-09', { profitKRW: 0, securitiesReturn: null, inactive: true }),
    summary('2026-08', { profitKRW: null, securitiesReturn: null }),
    summary('2026-07', { profitKRW: NaN, securitiesReturn: Infinity }),
    summary('2026-06', { profitKRW: 0, securitiesReturn: 0 }),
  ]);
  h.draw();
  const rows = h.rows().map(row => renderToStaticMarkup(row));
  assert.match(rows[0], /₩0/); assert.match(rows[0], /미운용/);
  assert.doesNotMatch(rows[0], /계산 불가|0\.00%/);
  for (const row of rows.slice(1, 3)) {
    assert.equal((row.match(/계산 불가/g) || []).length, 2);
    assert.doesNotMatch(row, /미운용|NaN|Infinity|₩0|0\.00%|market-up|market-down/);
  }
  assert.match(rows[3], /₩0/); assert.match(rows[3], /0\.00%/);
  assert.doesNotMatch(rows[3], /미운용|계산 불가/);
});

test('history view wires full history and transactions into an account scoped table independently of the chart', () => {
  const source = readFileSync(new URL('../src/features/performance/InvestmentHistory.tsx', import.meta.url), 'utf8');
  const analytics = readFileSync(new URL('../src/components/PerformanceAnalytics.tsx', import.meta.url), 'utf8');
  const table = source.match(/<PerformanceTable\b[^>]*\/>/g) || [];
  assert.equal(table.length, 1);
  assert.match(table[0], /key=\{scopeKey\}/);
  assert.match(table[0], /points=\{points\}/);
  assert.match(table[0], /transactions=\{transactions\}/);
  assert.match(table[0], /\bembedded\b/);
  assert.doesNotMatch(table[0], /normalizedPoints|chartData|assetData|displayCurrency|effectiveStart|effectiveEnd/);
  assert.doesNotMatch(analytics, /PerformanceTable|InvestmentHistory/);
});

test('embedded performance table removes its duplicate title while keeping rows and period controls', () => {
  const h = tableHarness(months(3));
  const standalone = h.draw();
  assert.match(standalone, /<h3>투자 성과<\/h3>/);
  const keys = h.rows().map(row => row.key);
  h.input.embedded = true;
  const embedded = h.draw();
  assert.match(embedded, /class="performance-history performance-history-embedded"/);
  assert.doesNotMatch(embedded, /<h[1-6]\b|<details\b|<summary\b/);
  assert.match(embedded, /aria-label="투자 성과"/);
  assert.match(embedded, /전체 기간 · 원화 기준/);
  assert.equal(h.button('월별').props['aria-pressed'], true);
  assert.equal(h.button('연도별').props['aria-pressed'], false);
  assert.deepEqual(h.rows().map(row => row.key), keys);
});
