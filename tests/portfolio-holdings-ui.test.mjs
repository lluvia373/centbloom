import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadTypescript } from './load-typescript.mjs';

const styles = { default: {} };
const overrides = {
  '@/hooks/useAuth': { useAuth: () => ({ user: null }) },
  '@/features/portfolio/ui/PortfolioHoldings.module.css': styles,
  './PortfolioHoldings.module.css': styles,
  './AssetAvatar': { AssetAvatar: () => null, EmptyPortfolio: () => '보유종목 없음' },
  './HoldingManagement': { HoldingManagement: () => null },
};
const { HoldingsTable } = loadTypescript('src/components/HoldingsTable.tsx', overrides);
const { AllocationChart } = loadTypescript('src/components/AllocationChart.tsx', overrides);
const { MARKETS } = loadTypescript('src/lib/markets.ts');
const render = (component, props) => renderToStaticMarkup(createElement(component, props));
const holding = (symbol, value, extra = {}) => ({
  id: symbol, symbol, name: symbol, quantity: 2, avgCost: 100, currency: 'KRW',
  quote: { symbol, price: value / 2, currency: 'KRW' },
  displayMarketValue: value, displayGainLoss: value - 200, displayGainLossPercent: (value - 200) / 2,
  valuationAvailable: true, gainAvailable: true, ...extra,
});

test('a missing quote or FX never makes a partially valued portfolio look like 100 percent', () => {
  const holdings = [holding('AAA', 1000), holding('BBB', 0, { quote: { symbol: 'BBB', price: 10, currency: 'USD' }, valuationAvailable: false, gainAvailable: false })];
  const table = render(HoldingsTable, { holdings, displayCurrency: 'KRW' });
  assert.equal((table.match(/data-label="비중"><strong>—<\/strong>/g) ?? []).length, 2);
  assert.match(table, /시세·환율 확인 필요/);
  const concentration = render(AllocationChart, { holdings, displayCurrency: 'KRW' });
  assert.match(concentration, /전체 비중을 표시할 수 없습니다/);
  assert.doesNotMatch(concentration, /100\.0%|style="width:/);
});

test('the pie exposes every holding, including small positions, with distinct named controls', () => {
  const holdings = Array.from({ length: 13 }, (_, index) => holding(`S${index}`, index === 12 ? 0.01 : index === 11 ? 7 : 1000 + index));
  const html = render(AllocationChart, { holdings, displayCurrency: 'KRW' });
  assert.equal((html.match(/<button\b/g) ?? []).length, holdings.length);
  for (const item of holdings) assert.ok(html.includes(`aria-label="${item.name} ${item.symbol},`));
  const colors = new Set([...html.matchAll(/fill="(var\(--cf-color-allocation-\d+\))"/g)].map((match) => match[1]));
  assert.equal(colors.size, holdings.length);
  assert.match(html, /S11 S11, 0\.1%/);
  assert.match(html, /S12 S12, 0%/);
  assert.doesNotMatch(html, /미만/);
  assert.doesNotMatch(html, /나머지|상위 3|stroke-dasharray/);
});

test('valuation ordering does not change a holding color and a single valued holding draws a full pie', () => {
  const props = { displayCurrency: 'KRW' };
  const before = render(AllocationChart, { ...props, holdings: [holding('BBB', 100), holding('AAA', 200)] });
  const after = render(AllocationChart, { ...props, holdings: [holding('AAA', 100), holding('BBB', 300)] });
  const fillFor = (html, symbol) => html.match(new RegExp(`aria-label="${symbol} ${symbol},[^]*?<rect[^]*?fill="([^"]+)"`))?.[1];
  for (const symbol of ['AAA', 'BBB']) {
    assert.ok(fillFor(before, symbol));
    assert.equal(fillFor(before, symbol), fillFor(after, symbol));
  }
  const one = render(AllocationChart, { ...props, holdings: [holding('AAA', 100), holding('BBB', 0)] });
  assert.match(one, /<circle[^>]*r="96"/);
  assert.match(one, /AAA AAA, 100\.0%/);
  assert.match(one, /BBB BBB, 0%/);
  const many = render(AllocationChart, { ...props, holdings: Array.from({ length: 25 }, (_, index) => holding(`S${index}`, 100)) });
  assert.equal((many.match(/<button\b[^>]*aria-pressed=/g) ?? []).length, 14);
  assert.match(many, /<pattern/);
});

test('large allocations limit only the visible list and keep every position in the pie', () => {
  for (const count of [1, 13, 14, 15, 100, 101, 200]) {
    const holdings = Array.from({ length: count }, (_, index) => holding(`S${String(index).padStart(3, '0')}`, count - index));
    const html = render(AllocationChart, { holdings, displayCurrency: 'KRW' });
    const holdingControls = [...html.matchAll(/<button\b[^>]*aria-label="([^"]+)"[^>]*aria-pressed=/g)].map((match) => match[1]);
    assert.equal(holdingControls.length, Math.min(count, 14), `${count} positions: list size`);
    for (let index = 0; index < holdingControls.length; index += 1) {
      assert.ok(holdingControls[index].startsWith(`${holdings[index].name} ${holdings[index].symbol},`), `${count} positions: descending accessible order ${index}`);
    }
    // Pagination must not silently turn the first page into the entire portfolio.
    const sliceGroup = html.match(/<g\b[^>]*clip-path="[^"]+"[^>]*>([^]*?)<\/g>/)?.[1];
    assert.ok(sliceGroup, `${count} positions: complete pie`);
    assert.equal((sliceGroup.match(/<(?:path|circle)\b/g) ?? []).length, count, `${count} positions: all slices`);
    const total = count * (count + 1) / 2;
    const expectedLargestWeight = `${(count / total * 100).toFixed(1)}%`;
    assert.ok(holdingControls[0].includes(`, ${expectedLargestWeight},`), `${count} positions: full portfolio denominator`);
    assert.doesNotMatch(html, /나머지|상위 3/);
  }
});

test('a missing valuation outside the first page prevents a falsely complete large-portfolio pie', () => {
  const holdings = Array.from({ length: 101 }, (_, index) => holding(`S${index}`, 101 - index));
  holdings[100].valuationAvailable = false;
  const html = render(AllocationChart, { holdings, displayCurrency: 'KRW' });
  assert.match(html, /전체 비중을 표시할 수 없습니다/);
  assert.doesNotMatch(html, /role="img"|aria-pressed=|100\.0%/);
});

test('missing daily data stays distinct from an observed zero without losing position details or actions', () => {
  const props = { holdings: [holding('AAA', 1000)], displayCurrency: 'KRW', editable: true };
  const missing = render(HoldingsTable, { ...props, dailyChangeReason: '자정 환율 미확인' });
  assert.match(missing, /data-label="오늘 기여"[^>]*title="자정 환율 미확인"[^>]*><strong[^>]*>—<\/strong>/);
  assert.match(missing, /2주 · 평균 ₩100/);
  assert.match(missing, /aria-label="AAA 보유종목 수정"/);
  assert.match(missing, /aria-label="AAA 보유종목 삭제"/);
  const observed = render(HoldingsTable, { ...props, dailyChanges: { AAA: 0 } });
  assert.match(observed, /data-label="오늘 기여"><strong[^>]*>₩0<\/strong>/);
  assert.match(observed, /data-label="비중"><strong>100\.0%<\/strong>/);
});

test('unconfirmed cost history does not show a fabricated gain while current value remains visible', () => {
  const html = render(HoldingsTable, {
    holdings: [holding('AAA', 1000, { gainAvailable: false })], displayCurrency: 'KRW',
  });
  assert.match(html, /data-label="평가액"><strong>₩1,000<\/strong>/);
  assert.match(html, /data-label="평가손익"><strong[^>]*>—<\/strong>/);
  assert.match(html, /계산 자료 미확인/);
  assert.doesNotMatch(html, /\+₩800/);
});

test('the compact toolbar keeps every supported market and the distinct amount and percentage sorts', () => {
  const html = render(HoldingsTable, { holdings: [holding('AAA', 1000)], displayCurrency: 'KRW' });
  assert.match(html, /<select[^>]*aria-label="보유 종목 시장 필터"/);
  for (const market of MARKETS) assert.ok(html.includes(`<option value="${market.id}">${market.label}</option>`));
  assert.match(html, /<option value="all" selected="">전체 시장<\/option>/);
  assert.match(html, /<option value="other">기타<\/option>/);
  assert.match(html, /<option value="gainAmount">평가손익 금액순<\/option>/);
  assert.match(html, /<option value="gainPercent">평가수익률 높은 순<\/option>/);
});
