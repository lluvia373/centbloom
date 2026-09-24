import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadTypescript } from './load-typescript.mjs';

const css = { default: new Proxy({}, { get: (_, key) => String(key) }) };
const overrides = { './Guru.module.css': css };
const { buildHoldingsDisplay, GuruHoldings } = loadTypescript('src/features/gurus/GuruHoldings.tsx', overrides);
const row = (id, changes = {}) => ({ rowId: String(id), issuer: `COMPANY ${id}`, shareClass: 'COM',
  cusip: String(id).padStart(9, '0'), valueUsd: 100, shares: 10, shareType: 'SH', option: null, mapping: null, ...changes });
const filing = (holdings, period = '2025-06-30') => ({ guruId: 'test-manager', accession: '0001234567-25-000001', period,
  filedDate: '2025-08-14', acceptedAt: '2025-08-14T12:00:00Z', publicAt: null,
  source: 'https://www.sec.gov/Archives/edgar/data/1234567/filing-index.html',
  tableSource: 'https://www.sec.gov/Archives/edgar/data/1234567/infotable.xml', kind: 'original', revision: 0,
  parentAccession: null, expectedRows: holdings.length, expectedValueUsd: holdings.reduce((sum, item) => sum + item.valueUsd, 0),
  complete: true, holdings });
const displayRows = count => Array.from({ length: count }, (_, index) => ({ id: String(index), issuer: `COMPANY ${String(index).padStart(5, '0')}`,
  security: 'COM', cusip: String(index).padStart(9, '0'), symbol: index === count - 1 ? 'VERIFIED' : null,
  value: '$100', weight: '1.00%', quantity: '10주', previousQuantity: null }));

function walk(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of React.Children.toArray(node.props?.children)) {
    const found = walk(child, predicate); if (found) return found;
  }
  return null;
}
function harness(rows, initial = {}) {
  const states = [], refs = [], effects = [], navigations = []; let cursor = 0, focused = 0, rendering = false, changed = false;
  let params = new URLSearchParams(initial.params ?? 'filing=selected-accession&keep=1');
  if (initial.query) params.set('holdingQuery', initial.query);
  if (initial.limit) params.set('holdingLimit', String(initial.limit));
  let props;
  const receive = () => {
    const query = params.get('holdingQuery')?.trim() ?? '', limit = Number(params.get('holdingLimit') ?? 50);
    const term = query.toLowerCase();
    const results = rows.filter(row => `${row.issuer} ${row.cusip} ${row.symbol ?? ''}`.toLowerCase().includes(term));
    props = { visibleRows: results.slice(0, limit), totalCount: rows.length, resultCount: results.length, query, limit, caption: '테스트 분기 보유 내역' };
  };
  receive();
  const { GuruHoldingsTable } = loadTypescript('src/features/gurus/GuruHoldingsTable.tsx', { ...overrides, react: { ...React,
    useState(initial) { const slot = cursor++; if (!(slot in states)) states[slot] = initial;
      return [states[slot], next => { const value = typeof next === 'function' ? next(states[slot]) : next;
        if (rendering && value !== states[slot]) changed = true; states[slot] = value; }]; },
    useId: () => `holdings-${cursor++}`,
    useRef(initial) { const slot = cursor++; return refs[slot] ??= { current: initial }; },
    useEffect(effect, dependencies) { const slot = cursor++;
      if (!effects[slot] || dependencies.some((value, index) => value !== effects[slot].dependencies[index])) {
        effects[slot]?.cleanup?.(); effects[slot] = { dependencies, cleanup: effect() };
      } },
    useTransition: () => [false, callback => callback()],
  }, 'next/navigation': {
    useRouter: () => ({ replace(url, options) { navigations.push({ url, options }); } }),
    usePathname: () => '/gurus/test-manager', useSearchParams: () => params,
  } });
  const tree = () => { let node;
    do { changed = false; cursor = 0; rendering = true; node = GuruHoldingsTable(props); rendering = false; } while (changed);
    const input = walk(node, item => item.type === 'input'); if (input) input.props.ref.current = { focus() { focused++; } };
    return node;
  };
  return { tree, html: () => renderToStaticMarkup(tree()), focused: () => focused, navigations,
    input: () => walk(tree(), node => node.type === 'input'),
    search(value) { walk(tree(), node => node.type === 'input').props.onChange({ target: { value } }); },
    more() { const button = walk(tree(), node => node.type === 'button' && node.props.className === 'control');
      assert.ok(button, 'more button exists'); assert.ok(!button.props.disabled, 'more button is enabled'); button.props.onClick(); },
    clear() { walk(tree(), node => node.props?.['aria-label'] === '보유 종목 검색어 지우기').props.onClick(); },
    commit() { assert.ok(navigations.length); params = new URL(navigations.at(-1).url, 'https://example.test').searchParams; receive(); },
    receive(query, limit = 50) { params.set('holdingQuery', query); params.set('holdingLimit', String(limit)); receive(); },
    unmount() { for (const effect of effects) effect?.cleanup?.(); },
  };
}
const renderedRows = html => (html.match(/role="rowheader"/g) ?? []).length;

test('server display rows retain security identity, manager-row totals and unknown previous/current quantities', () => {
  const previous = filing([row(1), row(2)], '2025-03-31');
  const current = filing([row(1, { valueUsd: 60, shares: 6 }), row(1, { rowId: 'split', valueUsd: 40, shares: 4 }),
    row(3, { valueUsd: 200, shares: 20 }), row(1, { rowId: 'class-b', shareClass: 'CL B', valueUsd: 300, shares: 30 })]);
  const { rows, comparisonNote } = buildHoldingsDisplay(current, previous);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].security, 'CL B'); assert.equal(rows[0].value, '$300'); assert.equal(rows[0].weight, '50.00%');
  const combined = rows.find(item => item.cusip === '000000001' && item.security === 'COM');
  assert.equal(combined.quantity, '10주'); assert.equal(combined.value, '$100'); assert.equal(combined.previousQuantity, '직전 10주');
  assert.equal(rows.find(item => item.cusip === '000000003').previousQuantity, '이전 보고 없음');
  const absent = rows.find(item => item.cusip === '000000002');
  assert.equal(absent.quantity, '이번 보고 없음'); assert.equal(absent.previousQuantity, '직전 10주');
  assert.equal(absent.value, '—'); assert.equal(absent.weight, '—');
  assert.match(comparisonNote, /실제 매매 수량이 아니며/);
});

test('scope restrictions, pending corrections and missing/nonadjacent previous quarters keep comparison disabled', () => {
  const current = filing([row(1)]), previous = filing([row(2)], '2025-03-31');
  const cases = [
    [current, undefined, false, '비교할 이전 분기'],
    [current, { ...previous, period: '2024-12-31' }, false, '보고 범위가 달라'],
    [current, previous, true, '정정 공시를 확인 중'],
    [{ ...current, disclosureScope: { reportType: 'holdings', confidentialOmitted: true } }, previous, false, '보고 범위가 달라'],
    [current, { ...previous, disclosureScope: { reportType: 'combination', confidentialOmitted: false } }, false, '보고 범위가 달라'],
  ];
  for (const [after, before, pending, message] of cases) {
    const display = buildHoldingsDisplay(after, before, pending);
    assert.equal(display.rows.length, 1); assert.equal(display.rows[0].previousQuantity, null);
    assert.ok(display.comparisonNote.includes(message));
  }
});

test('server/client boundary sends only formatted rows and resets the table at each accession', () => {
  const source = filing([row(1, { shareType: 'PRN', option: 'PUT', mapping: {
    symbol: 'KNOWN', source: 'https://example.test/verified-map', validFrom: '2025-01-01', validThrough: '2025-12-31',
  } })]);
  const component = GuruHoldings({ filing: source });
  const table = component.props.children[1];
  assert.equal(table.key, source.accession);
  assert.deepEqual(Object.keys(table.props).sort(), ['caption', 'limit', 'query', 'resultCount', 'totalCount', 'visibleRows']);
  assert.equal(table.props.visibleRows[0].symbol, 'KNOWN'); assert.equal(table.props.visibleRows[0].quantity, '10 (원금)');
  assert.equal(table.props.visibleRows[0].security, 'COM · PUT');
  assert.deepEqual(Object.keys(table.props.visibleRows[0]).sort(), ['cusip', 'id', 'issuer', 'previousQuantity', 'quantity', 'security', 'symbol', 'value', 'weight']);
  assert.ok(Object.values(table.props.visibleRows[0]).every(value => value === null || typeof value === 'string'));
  assert.ok(!JSON.stringify(table.props).includes('verified-map'));
});

test('large server holdings serialize only the requested window while search covers the complete set', () => {
  const source = filing(Array.from({ length: 50_001 }, (_, index) => row(index, { issuer: `COMPANY ${String(index).padStart(5, '0')}`,
    mapping: index === 50_000 ? { symbol: 'VERIFIED' } : null })));
  const table = GuruHoldings({ filing: source }).props.children[1];
  assert.equal(table.props.visibleRows.length, 50); assert.equal(table.props.totalCount, 50_001);
  assert.equal(table.props.resultCount, 50_001);
  assert.ok(!JSON.stringify(table.props).includes('COMPANY 50000'));
  assert.ok(JSON.stringify(table.props).length < 20_000, 'initial client payload remains bounded');
  assert.equal(GuruHoldings({ filing: source, holdingsLimit: '100' }).props.children[1].props.visibleRows.length, 100);
  for (const query of ['  company 50000  ', '000050000', 'verified']) {
    const results = GuruHoldings({ filing: source, holdingsQuery: query }).props.children[1].props;
    assert.equal(results.visibleRows.length, 1); assert.equal(results.resultCount, 1); assert.equal(results.totalCount, 50_001);
    assert.equal(results.visibleRows[0].symbol, 'VERIFIED');
  }
  for (const limit of ['NaN', 'Infinity', '1e6', '-1', '0', '50.5', '9007199254740992'])
    assert.equal(buildHoldingsDisplay(source, undefined, false, { limit }).rows.length, 50);
});

test('search updates the input immediately, debounces server navigation and clears to the first 50', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const ui = harness(displayRows(5101));
  assert.equal(renderedRows(ui.html()), 50); assert.match(ui.html(), /5,101개 중 50개 표시/);
  assert.ok(!ui.html().includes('COMPANY 05100'));
  ui.more(); assert.equal(renderedRows(ui.html()), 50); ui.commit(); assert.equal(renderedRows(ui.html()), 100);
  ui.search('company 05'); t.mock.timers.tick(100); ui.search('  company 05100  ');
  assert.equal(ui.input().props.value, '  company 05100  '); assert.match(ui.html(), /검색 중/);
  assert.equal(ui.navigations.length, 1); t.mock.timers.tick(149); assert.equal(ui.navigations.length, 1);
  t.mock.timers.tick(1); assert.equal(ui.navigations.length, 2);
  const target = new URL(ui.navigations.at(-1).url, 'https://example.test');
  assert.equal(target.searchParams.get('holdingQuery'), 'company 05100'); assert.equal(target.searchParams.get('holdingLimit'), null);
  assert.equal(target.searchParams.get('filing'), 'selected-accession'); assert.equal(target.searchParams.get('keep'), '1');
  assert.equal(ui.navigations.at(-1).options.scroll, false);
  ui.commit(); assert.equal(renderedRows(ui.html()), 1); assert.match(ui.html(), /VERIFIED/);
  ui.clear(); assert.equal(ui.input().props.value, ''); assert.equal(ui.navigations.length, 3); ui.commit();
  assert.equal(renderedRows(ui.html()), 50); assert.equal(ui.focused(), 1);
  ui.search('unmapped-ticker'); t.mock.timers.tick(150); ui.commit();
  assert.equal(renderedRows(ui.html()), 0); assert.match(ui.html(), /검색한 보유 종목이 없습니다/);
  assert.ok(!ui.html().includes('이 공시에 보고된 보유 종목이 없습니다'));
  ui.unmount();
});

test('last page and empty report preserve distinct controls and accessible labels', () => {
  const ui = harness(displayRows(123));
  let html = ui.html(); assert.match(html, /<label[^>]*>보유 종목 검색<\/label>/); assert.match(html, /aria-controls="holdings-/);
  assert.match(html, /role="status" aria-live="polite"/);
  ui.more(); ui.commit(); assert.equal(renderedRows(ui.html()), 100); assert.match(ui.html(), /23개 더 보기/);
  ui.more(); ui.commit(); assert.equal(renderedRows(ui.html()), 123); assert.ok(!ui.html().includes('개 더 보기'));
  const empty = harness([]).html(); assert.match(empty, /이 공시에 보고된 보유 종목이 없습니다/);
  assert.ok(!empty.includes('<input')); assert.ok(!empty.includes('<table')); assert.ok(!empty.includes('개 더 보기'));
  ui.unmount();
});

test('pending searches are cancelled on clear, composition and unmount without overwriting newer input', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const ui = harness(displayRows(123), { query: 'company', limit: 100 });
  ui.search('stale'); ui.clear(); t.mock.timers.tick(150); assert.equal(ui.navigations.length, 1);
  ui.commit(); assert.equal(renderedRows(ui.html()), 50);
  ui.input().props.onCompositionStart(); ui.search('종'); t.mock.timers.tick(150); assert.equal(ui.navigations.length, 1);
  ui.input().props.onCompositionEnd({ currentTarget: { value: '종목' } }); t.mock.timers.tick(150);
  assert.equal(ui.navigations.length, 2);
  ui.search('newer draft'); ui.receive('종목'); assert.equal(ui.input().props.value, 'newer draft');
  ui.unmount(); t.mock.timers.tick(150); assert.equal(ui.navigations.length, 2);
  const leaving = harness(displayRows(123));
  leaving.search('company'); leaving.input().props.onBlur(); assert.equal(leaving.navigations.length, 1);
  leaving.unmount(); t.mock.timers.tick(150); assert.equal(leaving.navigations.length, 1);
  const restored = harness(displayRows(123), { query: 'company' });
  restored.receive('000000001'); assert.equal(restored.input().props.value, '000000001'); restored.unmount();
});
