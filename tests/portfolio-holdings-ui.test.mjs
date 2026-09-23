import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
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

test('only a position using daily reference FX shows its applied date in the daily contribution', () => {
  const html = render(HoldingsTable, { holdings: [holding('AAA', 1000), holding('BBB', 2000)], displayCurrency: 'KRW',
    dailyChanges: { AAA: 10, BBB: 20 }, referenceDatesBySymbol: { AAA: ['2026-09-18'] } });
  assert.equal(html.split('9/18 일별 환율 적용').length - 1, 1);
  assert.match(html, /\+₩10/); assert.match(html, /\+₩20/);
  assert.doesNotMatch(html, /추정/);
});

test('reference date captions retain every distinct applied day and do not appear on unavailable results', () => {
  const props = { holdings: [holding('AAA', 1000)], displayCurrency: 'KRW',
    referenceDatesBySymbol: { AAA: ['2026-09-18', '2026-09-17', '2026-09-18'] } };
  const html = render(HoldingsTable, { ...props, dailyChanges: { AAA: 0 } });
  assert.match(html, /₩0/); assert.equal(html.split('9/17·9/18 일별 환율 적용').length - 1, 1);
  const missing = render(HoldingsTable, { ...props, dailyChangeReason: '현재 환율 미확인' });
  assert.match(missing, /현재 환율 미확인/); assert.doesNotMatch(missing, /일별 환율 적용|추정/);
});

test('last-received minute rates get a different caption only on affected positions', () => {
  const props = { holdings: [holding('AAA', 1000), holding('BBB', 2000)], displayCurrency: 'KRW',
    carriedDatesBySymbol: { AAA: ['2026-09-17'] } };
  const html = render(HoldingsTable, { ...props, dailyChanges: { AAA: 0, BBB: 20 } });
  assert.equal(html.split('9/17 최종 수신 환율 적용').length - 1, 1);
  assert.doesNotMatch(html, /일별 환율 적용|추정/);
  const missing = render(HoldingsTable, props);
  assert.doesNotMatch(missing, /최종 수신 환율 적용/);
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
  assert.match(missing, /data-label="오늘 손익"[^>]*title="자정 환율 미확인"[^>]*><strong[^>]*>—<\/strong>/);
  assert.match(missing, /2주 · 평균 ₩100/);
  assert.match(missing, /aria-label="AAA 보유종목 수정"/);
  assert.match(missing, /aria-label="AAA 보유종목 삭제"/);
  const observed = render(HoldingsTable, { ...props, dailyChanges: { AAA: 0 } });
  assert.match(observed, /<th[^>]*>오늘 손익<\/th>/);
  assert.match(observed, /<option value="dailyHigh">오늘 손익 높은 순<\/option>/);
  assert.match(observed, /<option value="dailyLow">오늘 손익 낮은 순<\/option>/);
  assert.doesNotMatch(observed, /오늘 기여|오늘 변동/);
  assert.match(observed, /data-label="오늘 손익"><strong[^>]*>₩0<\/strong>/);
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

const rowSymbols = (html) => [...(html.match(/<tbody>([^]*?)<\/tbody>/)?.[1] ?? '').matchAll(/href="\/stock\/([^"]+)"/g)]
  .map((match) => decodeURIComponent(match[1]));

// Exercise the component's actual event handlers without fetching quotes or changing a user's ledger.
function interactiveHoldings(initialProps) {
  let props = initialProps;
  let user = null;
  let cursor = 0;
  const state = [];
  const { HoldingsTable: Interactive } = loadTypescript('src/components/HoldingsTable.tsx', {
    ...overrides,
    '@/hooks/useAuth': { useAuth: () => ({ user }) },
    react: {
      ...React,
      useId: () => 'holdings-test',
      useMemo: (compute) => compute(),
      useState: (initial) => {
        const index = cursor++;
        if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
        return [state[index], (next) => { state[index] = typeof next === 'function' ? next(state[index]) : next; }];
      },
    },
  });
  const tree = () => { cursor = 0; return Interactive(props); };
  function* nodes(node) {
    if (Array.isArray(node)) { for (const child of node) yield* nodes(child); }
    else if (React.isValidElement(node)) { yield node; yield* nodes(node.props.children); }
  }
  const find = (predicate) => [...nodes(tree())].find(predicate);
  return {
    html: () => renderToStaticMarkup(tree()),
    row: (id) => find((node) => node.type === 'tr' && node.key === id),
    more: () => find((node) => node.type === 'button' && node.props['aria-controls'] === 'holdings-test').props.onClick(),
    change: (label, value) => find((node) => node.props['aria-label'] === label).props.onChange({ target: { value } }),
    update: (next) => { props = { ...props, ...next }; },
    switchUser: (id) => { user = id == null ? null : { id }; },
  };
}

const ringSegments = (html) => [...html.matchAll(/<circle data-holding-id="([^"]+)" data-weight="([^"]+)" data-start="([^"]+)"[^>]*?stroke="([^"]+)"/g)]
  .map(([, id, weight, start, color]) => ({ id, weight: Number(weight), start: Number(start), color }));
const combinedProps = { displayCurrency: 'KRW', embedded: true, showAllocation: true };

test('integrated allocation: all 1, 8, 21, 200 and 2000 holdings fit one donut while the table stays batched', () => {
  for (const count of [1, 8, 21, 200, 2000]) {
    const holdings = Array.from({ length: count }, (_, index) => holding(`S${index}`, index + 1));
    const html = render(HoldingsTable, { ...combinedProps, holdings });
    const segments = ringSegments(html);
    assert.equal(segments.length, count);
    assert.ok(Math.abs(segments.reduce((sum, segment) => sum + segment.weight, 0) - 100) < 1e-8);
    assert.equal(rowSymbols(html).length, Math.min(20, count));
    assert.equal((html.match(/aria-label="보유 종목 검색"/g) ?? []).length, 1);
    assert.equal((html.match(/<figure/g) ?? []).length, 1);
    assert.match(html, /전체 보유자산 기준/);
    assert.match(html, /<table[^>]+aria-describedby=/);
    const svg = html.match(/<svg[^]*?<\/svg>/)?.[0];
    assert.ok(svg);
    assert.doesNotMatch(svg, /tabindex|<button|min-width|NaN|Infinity/);
    assert.match(svg, /viewBox="0 0 200 200"/);
    assert.match(svg, /stroke-linecap="butt"/);
    assert.doesNotMatch(html, /자산 구성 검색|이전 페이지|다음 페이지|상위 종목|나머지/);
  }
});

test('integrated allocation: filtering, sorting and show more never rebase the donut or row percentages', () => {
  const holdings = Array.from({ length: 45 }, (_, i) => holding(`${String(i).padStart(6, '0')}.${i % 2 ? 'T' : 'KS'}`, 100));
  const ui = interactiveHoldings({ ...combinedProps, holdings });
  const initial = ringSegments(ui.html());
  ui.more();
  assert.equal(rowSymbols(ui.html()).length, 40);
  assert.deepEqual(ringSegments(ui.html()), initial);
  ui.change('보유 종목 검색', holdings[44].symbol);
  assert.deepEqual(rowSymbols(ui.html()), [holdings[44].symbol]);
  assert.match(ui.html(), /data-label="비중"[^]*?>2\.2%<\/strong>/);
  assert.deepEqual(ringSegments(ui.html()), initial);
  ui.change('보유 종목 검색', 'no-match');
  assert.match(ui.html(), /조건에 맞는 보유 종목이 없습니다/);
  assert.deepEqual(ringSegments(ui.html()), initial);
  ui.change('보유 종목 검색', '');
  ui.change('보유 종목 시장 필터', 'kr');
  assert.ok(rowSymbols(ui.html()).every(symbol => symbol.endsWith('.KS')));
  ui.change('보유종목 정렬', 'gainPercent');
  assert.deepEqual(ringSegments(ui.html()), initial);
  assert.match(ui.html(), /data-label="비중"[^]*?>2\.2%<\/strong>/);
});

test('integrated allocation: missing offscreen valuations, zero totals and empty holdings never invent a complete donut', () => {
  for (const value of [0, NaN, Infinity, -1]) {
    const holdings = Array.from({ length: 2001 }, (_, i) => holding(`S${i}`, 100));
    holdings[2000] = holding('S2000', value, { valuationAvailable: value !== 0 });
    const html = render(HoldingsTable, { ...combinedProps, holdings });
    assert.equal(ringSegments(html).length, 0);
    assert.match(html, /시세·환율이 누락되어 전체 비중을 표시할 수 없습니다/);
    assert.equal((html.match(/data-label="비중"><strong>—<\/strong>/g) ?? []).length, 20);
  }
  const zero = render(HoldingsTable, { ...combinedProps, holdings: [holding('ZERO', 0)] });
  assert.match(zero, /평가액이 없어 비중을 표시할 수 없습니다/);
  assert.match(zero, /data-label="비중"><strong>—<\/strong>/);
  assert.doesNotMatch(zero, /role="img"/);
  const mixed = render(HoldingsTable, { ...combinedProps, holdings: [holding('AAA', 100), holding('ZERO', 0)] });
  assert.equal(ringSegments(mixed).find(segment => segment.id === 'ZERO').weight, 0);
  assert.match(mixed, />0%<\/strong>/);
  const empty = render(HoldingsTable, { ...combinedProps, holdings: [] });
  assert.match(empty, /보유종목 없음/);
  assert.doesNotMatch(empty, /<figure|전체 보유자산 기준|role="img"/);
  const loading = render(HoldingsTable, { ...combinedProps, holdings: [holding('AAA', 0, { valuationAvailable: false })], loading: true });
  assert.match(loading, /시세·환율 확인 중/);
});

test('integrated allocation: row focus and hover use a shared outline without new tiny targets or lost actions', () => {
  const holdings = [holding('AAA', 600), holding('BBB', 400)];
  const ui = interactiveHoldings({ ...combinedProps, holdings, editable: true });
  ui.row('AAA').props.onFocusCapture();
  assert.match(ui.html(), /data-allocation-outline="AAA"/);
  assert.match(ui.html(), /<tr data-allocation-active="true"/);
  assert.match(ui.html(), /stroke-width="32"/);
  ui.row('BBB').props.onPointerEnter();
  assert.match(ui.html(), /data-allocation-outline="BBB"/);
  ui.row('BBB').props.onPointerLeave();
  assert.match(ui.html(), /data-allocation-outline="AAA"/, 'mouse leave preserves keyboard focus');
  ui.row('AAA').props.onBlurCapture({ currentTarget: { contains: () => true }, relatedTarget: {} });
  assert.match(ui.html(), /data-allocation-outline="AAA"/, 'focus within the same row stays highlighted');
  ui.row('AAA').props.onBlurCapture({ currentTarget: { contains: () => false }, relatedTarget: null });
  assert.doesNotMatch(ui.html(), /data-allocation-outline=/);
  ui.row('AAA').props.onPointerEnter();
  ui.row('BBB').props.onFocusCapture();
  assert.match(ui.html(), /data-allocation-outline="BBB"/, 'new keyboard focus takes priority over a stationary mouse');
  ui.row('AAA').props.onFocusCapture();
  ui.change('보유종목 정렬', 'gainPercent');
  assert.doesNotMatch(ui.html(), /data-allocation-outline=/);
  ui.row('AAA').props.onFocusCapture();
  ui.change('보유 종목 검색', 'BBB');
  assert.doesNotMatch(ui.html(), /data-allocation-outline=/);
  ui.row('BBB').props.onFocusCapture();
  ui.switchUser('different-account');
  assert.doesNotMatch(ui.html(), /data-allocation-outline=/);
  const html = ui.html();
  assert.match(html, /href="\/stock\/BBB"/);
  assert.match(html, /aria-label="BBB 보유종목 수정"/);
  assert.match(html, /aria-label="BBB 보유종목 삭제"/);
  assert.doesNotMatch(html, /<tr[^>]*tabindex|<circle[^>]*tabindex/);
});

test('integrated allocation: stable donut colors match the unobtrusive marker beside each exact weight', () => {
  const before = render(HoldingsTable, { ...combinedProps, holdings: [holding('AAA', 600), holding('BBB', 400)] });
  const after = render(HoldingsTable, { ...combinedProps, holdings: [holding('AAA', 200), holding('BBB', 800)] });
  for (const id of ['AAA', 'BBB']) {
    const segment = ringSegments(before).find(item => item.id === id);
    assert.equal(segment.color, ringSegments(after).find(item => item.id === id).color);
    assert.ok(before.includes(`style="background-color:${segment.color}" aria-hidden="true"`));
  }
  assert.match(before, />60\.0%<\/strong>/);
  assert.match(before, />40\.0%<\/strong>/);
});

test('integrated allocation: compact overview leaves the table full width on desktop and mobile', () => {
  const css = readFileSync(new URL('../src/features/portfolio/ui/PortfolioHoldings.module.css', import.meta.url), 'utf8');
  assert.match(css, /\.holdingsOverview\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /@container \(min-width: 1000px\)[^]*\.holdingsOverview\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.doesNotMatch(css, /\.composedHoldings/);
  assert.match(css, /\.embeddedHoldings \.search\s*\{ margin-right: 0/);
  const source = readFileSync('src/components/HoldingsTable.tsx', 'utf8');
  assert.ok(source.indexOf('styles.holdingsOverview') < source.indexOf('styles.toolbar'));
  assert.ok(source.indexOf('styles.holdingsContent') > source.indexOf('styles.toolbarAction'));
  assert.match(css, /\.compositionRing\s*\{[^}]*max-width: 100%/);
  assert.match(css, /\.table tr\[data-allocation-active\] \.weight > strong\s*\{[^}]*text-decoration: underline/);
  assert.match(css, /\.assetLink:focus-visible\s*\{[^}]*outline: 2px/);
  assert.match(css, /@container \(max-width: 700px\)/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.table td > strong\s*\{ overflow-wrap: anywhere/);
  assert.match(css, /\.holdingsContent\s*\{[^}]*min-width: 0;[^}]*container-type: inline-size/);
  assert.match(css, /\.compositionCaption\s*\{[^}]*overflow-wrap: anywhere/);
  assert.doesNotMatch(css, /\.compositionBar|\.weightTrack|\.compositionLabels/);
});

test('integrated allocation: center identifies the largest or focused holding without extra lists or fake small slices', () => {
  const holdings = [holding('AAA', 600, { name: 'Apple Inc.' }), holding('000660.KS', 399, { name: 'SK hynix Inc.' }), holding('TINY', 1)];
  const ui = interactiveHoldings({ ...combinedProps, holdings });
  const html = ui.html();
  const composition = html.match(/<figure[^]*?<\/figure>/)[0];
  assert.doesNotMatch(composition, />TINY<|<button|tabindex|<a /);
  assert.match(composition, /최대 비중/);
  assert.match(composition, /<strong>Apple Inc\.<\/strong>/);
  assert.match(composition, />60\.0%<\/strong>/);
  assert.ok(ringSegments(composition).some(segment => segment.id === 'TINY' && segment.weight === 0.1));
  assert.ok(rowSymbols(html).includes('TINY'));
  ui.row('000660.KS').props.onFocusCapture();
  const focused = ui.html().match(/<figure[^]*?<\/figure>/)[0];
  assert.match(focused, /<strong>SK hynix Inc\.<\/strong>/);
  assert.match(focused, /보유 비중/);
  assert.match(focused, />39\.9%<\/strong>/);
  const zero = render(HoldingsTable, { ...combinedProps, holdings: [holding('AAA', 100), holding('ZERO', 0)] });
  assert.match(zero, /stroke-dasharray="0 100"/);
  assert.match(zero, /stroke-dasharray="100 0"/);
  const many = render(HoldingsTable, { ...combinedProps, holdings: Array.from({ length: 2000 }, (_, i) => holding(`S${i}`, 1)) });
  assert.equal(ringSegments(many).length, 2000);
  assert.doesNotMatch(many, /stroke-dasharray="0 100"/, 'small positive positions retain their actual arc');
});

test('holdings batches: first render caps rows at 20 and preserves full-portfolio weights', () => {
  for (const count of [0, 8, 20, 21, 200]) {
    const holdings = Array.from({ length: count }, (_, index) => holding(`S${String(index).padStart(3, '0')}`, 1000));
    const html = render(HoldingsTable, { holdings, displayCurrency: 'KRW' });
    assert.equal(rowSymbols(html).length, Math.min(count, 20), `${count} holdings`);
    assert.equal(html.includes('개 더 보기'), count > 20);
    if (count > 20) assert.ok(html.includes(`${Math.min(20, count - 20)}개 더 보기`));
    if (count === 200) assert.equal((html.match(/data-label="비중"><strong>0\.5%<\/strong>/g) ?? []).length, 20);
    if (count === 0) assert.match(html, /보유종목 없음/);
  }
});

test('holdings batches: show more appends 20 then the remainder without changing the source', () => {
  const holdings = Array.from({ length: 45 }, (_, index) => holding(`S${String(index).padStart(3, '0')}`, index + 1));
  const originalOrder = holdings.map((item) => item.symbol);
  const expected = [...originalOrder].reverse();
  const ui = interactiveHoldings({ holdings, displayCurrency: 'KRW' });
  assert.deepEqual(rowSymbols(ui.html()), expected.slice(0, 20));
  ui.more();
  assert.deepEqual(rowSymbols(ui.html()), expected.slice(0, 40));
  assert.match(ui.html(), /40 \/ 45종목 표시/);
  assert.match(ui.html(), /5개 더 보기/);
  ui.update({ holdings: holdings.map((item) => ({ ...item, displayMarketValue: item.displayMarketValue * 2 })) });
  assert.equal(rowSymbols(ui.html()).length, 40, 'quote refresh keeps expanded rows');
  ui.more();
  assert.deepEqual(rowSymbols(ui.html()), expected);
  assert.match(ui.html(), /45 \/ 45종목 표시/);
  assert.doesNotMatch(ui.html(), /개 더 보기/);
  assert.deepEqual(holdings.map((item) => item.symbol), originalOrder);
});

test('holdings batches: search covers hidden rows and query, market, sort, account changes reset the limit', () => {
  const holdings = Array.from({ length: 60 }, (_, index) => holding(`${String(index).padStart(6, '0')}.${index % 2 ? 'T' : 'KS'}`, 60 - index));
  const ui = interactiveHoldings({ holdings, displayCurrency: 'KRW' });
  ui.more();
  assert.equal(rowSymbols(ui.html()).length, 40);
  ui.change('보유 종목 검색', holdings[59].symbol);
  assert.deepEqual(rowSymbols(ui.html()), [holdings[59].symbol]);
  ui.change('보유 종목 검색', 'not-found');
  assert.match(ui.html(), /조건에 맞는 보유 종목이 없습니다/);
  assert.doesNotMatch(ui.html(), /개 더 보기/);
  ui.change('보유 종목 검색', '');
  assert.equal(rowSymbols(ui.html()).length, 20);
  ui.more();
  ui.change('보유 종목 시장 필터', 'kr');
  assert.equal(rowSymbols(ui.html()).length, 20);
  assert.ok(rowSymbols(ui.html()).every((symbol) => symbol.endsWith('.KS')));
  ui.more();
  assert.equal(rowSymbols(ui.html()).length, 30);
  ui.change('보유종목 정렬', 'gainPercent');
  assert.equal(rowSymbols(ui.html()).length, 20);
  ui.change('보유 종목 시장 필터', 'all');
  ui.more();
  assert.equal(rowSymbols(ui.html()).length, 40);
  ui.switchUser('another-account');
  assert.equal(rowSymbols(ui.html()).length, 20);
  ui.switchUser(null);
  assert.equal(rowSymbols(ui.html()).length, 20, 'returning to the previous account does not restore its expanded limit');
});

test('holdings batches: default weight order breaks exact ties by latest buy or sell date then ticker', () => {
  const holdings = ['EEE', 'DDD', 'CCC', 'BBB', 'AAA'].map((symbol) => holding(symbol, 1000, { addedAt: '2026-09-01' }));
  holdings.push(holding('HIGH', 1000.0001), holding('UNKNOWN', 999999, { valuationAvailable: false }));
  const trade = (symbol, date, type = 'buy', createdAt = `${date}T00:00:00Z`) => ({ symbol, date, type, createdAt });
  const transactions = [
    trade('BBB', '2026-09-21', 'sell'), trade('BBB', '2026-09-01'),
    trade('CCC', '2026-09-21'), trade('AAA', '2026-09-20', 'buy', '2026-09-30T00:00:00Z'),
  ];
  const html = render(HoldingsTable, { holdings, transactions, displayCurrency: 'KRW' });
  assert.deepEqual(rowSymbols(html), ['HIGH', 'BBB', 'CCC', 'AAA', 'DDD', 'EEE', 'UNKNOWN']);
  assert.match(html, /<option value="value" selected="">비중 높은 순<\/option>/);
});
