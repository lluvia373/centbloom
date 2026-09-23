import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadTypescript } from './load-typescript.mjs';

const styles = { default: new Proxy({}, { get: (_, key) => String(key) }) };
const overrides = {
  '@/hooks/useAuth': { useAuth: () => ({ user: null }) },
  '@/features/portfolio/ui/PortfolioHoldings.module.css': styles,
  './PortfolioHoldings.module.css': styles,
  './AssetAvatar': { AssetAvatar: () => null, EmptyPortfolio: () => '보유종목 없음' },
  './HoldingManagement': { HoldingManagement: () => null },
};
const { HoldingsTable } = loadTypescript('src/components/HoldingsTable.tsx', overrides);
const { AllocationChart } = loadTypescript('src/components/AllocationChart.tsx', overrides);
const render = (component, props) => renderToStaticMarkup(createElement(component, props));
const holding = {
  id: 'AAA', symbol: 'AAA', name: 'Example Holding', quantity: 2, avgCost: 100,
  currency: 'KRW', quote: { symbol: 'AAA', price: 500, currency: 'KRW' },
  displayMarketValue: 1000, displayGainLoss: 800, displayGainLossPercent: 400,
  valuationAvailable: true, gainAvailable: true,
};

test('portfolio summary balances two groups across the card and preserves mobile wrapping', () => {
  const css = readFileSync(new URL('../src/styles/portfolio.css', import.meta.url), 'utf8');
  const summaryEnd = css.indexOf('.performance-panel');
  assert.ok(summaryEnd > 0, 'keep this regression scoped to the summary styles');
  const summary = css.slice(0, summaryEnd);
  const declarations = (selector) => {
    const rules = [...summary.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    return rules
      .filter(([, selectors]) => selectors.split(',').some((value) => value.trim() === selector))
      .map(([, , body]) => body).join('\n');
  };

  assert.doesNotMatch(summary, /repeat\(3|border-left\s*:/);
  assert.match(declarations('.portfolio-summary-grid'), /display:\s*grid\s*;/);
  assert.match(declarations('.portfolio-summary-grid'), /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)\s*;/);
  assert.doesNotMatch(declarations('.portfolio-summary-grid'), /max-content|justify-content:\s*start/);
  assert.match(declarations('.portfolio-summary-grid'), /gap:\s*var\(--cf-space-2\) var\(--cf-space-8\)\s*;/);
  assert.match(declarations('.portfolio-summary-grid > .portfolio-summary-daily'), /grid-row:\s*1 \/ span 2/);
  assert.match(declarations('.portfolio-summary-daily > dt'), /flex-basis:\s*auto\s*;/);
  assert.match(declarations('.portfolio-summary-daily > .portfolio-summary-result'), /font-size:\s*var\(--cf-text-section\)/);
  assert.doesNotMatch(declarations('.portfolio-summary-daily > .portfolio-summary-result'), /--cf-text-title|--cf-text-metric/);
  const row = declarations('.portfolio-summary-grid > div');
  for (const property of [/display:\s*flex\s*;/, /flex-wrap:\s*wrap\s*;/, /align-items:\s*baseline\s*;/]) {
    assert.match(row, property);
  }
  assert.match(declarations('.portfolio-summary-total > dt'), /flex-basis:\s*100%\s*;/);
  assert.match(declarations('.portfolio-summary-value'), /font-size:\s*var\(--cf-text-metric\)/);
  assert.match(declarations('.portfolio-summary-cost'), /flex-basis:\s*100%\s*;/);
  assert.match(declarations('.portfolio-summary-context'), /color:\s*var\(--cf-color-muted\)/);
  assert.match(declarations('.portfolio-summary-context'), /font-size:\s*var\(--cf-text-caption\)/);
  assert.match(declarations('.portfolio-summary-result'), /font-size:\s*var\(--cf-text-section\)/);
  assert.match(declarations('.portfolio-summary-gain'), /font-size:\s*var\(--cf-text-body\)/);
  assert.match(declarations('.portfolio-summary-value'), /overflow-wrap:\s*anywhere/);
  assert.match(declarations('.portfolio-summary-factors'), /font-size:\s*var\(--cf-text-caption\)/);
  assert.match(declarations('.portfolio-summary-factors'), /flex-basis:\s*100%/);
  assert.match(declarations('.portfolio-summary-factor'), /display:\s*inline-flex/);
  assert.match(declarations('.portfolio-summary-factors strong'), /white-space:\s*nowrap/);
  assert.doesNotMatch(summary, /portfolio-summary-(equation|operator|term)|border-top\s*:|justify-content:\s*space-between/);
  for (const className of ['value', 'result', 'context', 'factors']) {
    assert.match(declarations(`.portfolio-summary-grid .portfolio-summary-${className}`), /margin-top:\s*0\s*;/);
  }
  const mobile = summary.match(/@container\s*\(max-width:\s*600px\)\s*\{([\s\S]*?)\n\}/)?.[1];
  assert.ok(mobile, 'narrow summaries need explicit wrapping for cost and daily details');
  assert.match(mobile, /grid-template-columns:\s*minmax\(0, 1fr\)\s*;/);
  assert.match(mobile, /grid-column:\s*auto\s*;\s*grid-row:\s*auto/);
  for (const selector of [
    '.portfolio-summary-total > .portfolio-summary-context',
    '.portfolio-summary-daily > .portfolio-summary-factors',
    '.portfolio-summary-daily > .portfolio-summary-context',
  ]) {
    assert.ok(mobile.includes(selector));
    assert.match(declarations(selector), /flex-basis:\s*100%\s*;/);
  }
});

test('embedded holdings remove the duplicate heading but preserve tools, values and the empty state', () => {
  const props = {
    holdings: [holding], displayCurrency: 'KRW', editable: true, dailyChanges: { AAA: 25 },
    toolbarAction: createElement('button', null, '보유 자산 CSV'),
  };
  assert.match(render(HoldingsTable, props), /<h2>보유종목 /);
  const html = render(HoldingsTable, { ...props, embedded: true });
  assert.match(html, /class="holdings embeddedHoldings" aria-label="보유종목"/);
  assert.doesNotMatch(html, /<h[1-6]\b|<details\b|<summary\b/);
  for (const label of ['보유 종목 검색', '보유 종목 시장 필터', '보유종목 정렬', 'AAA 보유종목 수정', 'AAA 보유종목 삭제']) {
    assert.ok(html.includes(`aria-label="${label}"`));
  }
  assert.match(html, /보유 자산 CSV/); assert.match(html, /₩1,000/); assert.match(html, /\+₩25/);
  assert.match(html, /data-label="비중"[^>]*><strong>100\.0%/);
  const empty = render(HoldingsTable, { holdings: [], displayCurrency: 'KRW', embedded: true });
  assert.match(empty, /보유종목 없음/); assert.doesNotMatch(empty, /<h2|<table|보유 자산 CSV/);
});

test('embedded allocation removes the duplicate heading but preserves the pie and missing-value notice', () => {
  const props = { holdings: [holding], displayCurrency: 'KRW' };
  assert.match(render(AllocationChart, props), /<h2>자산 구성 /);
  const html = render(AllocationChart, { ...props, embedded: true });
  assert.match(html, /class="concentration embeddedAllocation" aria-label="보유종목 구성"/);
  assert.doesNotMatch(html, /<h[1-6]\b|<details\b|<summary\b/);
  assert.match(html, /role="img" aria-label="전체 1종목 비중"/);
  assert.match(html, /aria-label="Example Holding AAA, 100\.0%, ₩1,000"/);
  assert.match(html, /<circle[^>]*r="96"/);
  const missing = render(AllocationChart, {
    ...props, embedded: true, holdings: [{ ...holding, valuationAvailable: false }],
  });
  assert.match(missing, /role="status"/); assert.match(missing, /전체 비중을 표시할 수 없습니다/);
  assert.doesNotMatch(missing, /<h2|role="img"|100\.0%/);
  assert.equal(render(AllocationChart, { ...props, embedded: true, holdings: [] }), '');
});

test('performance controls share selection styling and leave the main asset value dominant', () => {
  const css = readFileSync(new URL('../src/styles/portfolio.css', import.meta.url), 'utf8');
  const declarations = selector => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectors]) => selectors.split(',').some(value => value.trim() === selector))
    .map(([, , body]) => body).join('\n');
  const choice = declarations('.performance-choice');
  assert.match(choice, /min-height: calc\(var\(--cf-space-8\) \+ var\(--cf-space-1\)\)/);
  assert.match(choice, /border-radius: var\(--cf-radius-control\)/);
  assert.match(declarations('.performance-choice[aria-pressed="true"]'), /background: var\(--cf-color-soft\)/);
  assert.match(declarations('.performance-choice[aria-pressed="true"]'), /font-weight: var\(--cf-weight-semibold\)/);
  assert.doesNotMatch(css, /\.performance-ranges[^{}]*::after/);
  assert.doesNotMatch(declarations('.performance-modes'), /background:|padding:|border:/);
  assert.match(declarations('.performance-dates'), /outline: 1px solid var\(--cf-color-line\)/);
  assert.match(declarations('.performance-dates'), /min-height: calc\(var\(--cf-space-8\) \+ var\(--cf-space-1\)\)/);
  assert.match(declarations('.performance-metric-amount'), /font-size: var\(--cf-text-body\)/);
  assert.match(declarations('.performance-controls'), /margin-left: auto/);
  assert.match(declarations('.performance-chart'), /height: 280px/);
  assert.match(declarations('.performance-choice:focus-visible'), /outline: 2px solid var\(--cf-color-focus\)/);
  assert.match(choice, /min-height: calc\(var\(--cf-space-12\) - var\(--cf-space-1\)\)/);
});
