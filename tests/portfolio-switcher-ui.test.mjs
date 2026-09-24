import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadTypescript } from './load-typescript.mjs';

const nodes = value => Array.isArray(value) ? value.flatMap(nodes)
  : React.isValidElement(value) ? [value, ...nodes(value.props.children)] : [];
function harness(overrides = {}, props = {}) {
  const state = [], refs = [], calls = [];
  let cursor = 0, refCursor = 0, tree, current = true;
  const model = {
    portfolios: [{ id: 'one', name: '기본 포트폴리오' }, { id: 'two', name: '장기 투자' }],
    selectedPortfolioId: 'one', status: 'ready', writable: true,
    setSelectedPortfolioId: id => calls.push(['select', id]),
    createPortfolio: async name => { calls.push(['create', name]); return null; },
    renamePortfolio: async (id, name) => { calls.push(['rename', id, name]); return null; },
    deletePortfolio: async (id, target) => { calls.push(['delete', id, target]); return null; },
    ...overrides,
  };
  const { PortfolioSwitcher } = loadTypescript('src/features/portfolio/ui/PortfolioSwitcher.tsx', {
    react: { ...React, useEffect: () => {}, useId: () => 'qa', useRef: value => {
      const index = refCursor++; return refs[index] ??= { current: value };
    }, useState: initial => {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    } },
    '@/hooks/useAuth': { useAuth: () => ({ user: { id: 'owner' } }) },
    '@/hooks/usePortfolio': { usePortfolios: () => model, useAllTransactions: () => ({ transactions: [{ id: 'trade', portfolioId: 'one' }] }) },
    '@/shared/react/use-operation-scope': { useOperationScope: () => () => () => current },
    './PortfolioSwitcher.module.css': { default: new Proxy({}, { get: (_, key) => key }) },
  });
  function find(predicate) { const node = nodes(tree).find(predicate); assert.ok(node, 'UI element exists'); return node; }
  return {
    model, calls,
    draw() { cursor = 0; refCursor = 0; const wrapper = PortfolioSwitcher(props); tree = wrapper.type(wrapper.props); return renderToStaticMarkup(tree); },
    button(label) { return find(n => n.type === 'button' && (n.props['aria-label'] === label || n.props.children === label)); },
    field(type) { return find(n => n.type === type); },
    find,
    invalidate() { current = false; },
  };
}

test('portfolio switch is a labelled compact control with aggregate and account portfolios', () => {
  const ui = harness(); const html = ui.draw();
  assert.match(html, /포트폴리오 선택/); assert.match(html, /기본 포트폴리오/);
  assert.match(html, /value="all"/);
  ui.field('select').props.onChange({ target: { value: 'two' } });
  assert.deepEqual(ui.calls, [['select', 'two']]);
});
test('trade destination never offers aggregate as a save target', () => {
  const ui = harness({ selectedPortfolioId: 'all' }, { destination: true }); const html = ui.draw();
  assert.doesNotMatch(html, /value="all"/); assert.match(html, /포트폴리오 선택/);
  assert.equal(ui.field('select').props.value, '');
});
test('creation and rename use explicit form submission', async () => {
  const ui = harness(); ui.draw(); ui.button('새 포트폴리오').props.onClick(); ui.draw();
  ui.field('input').props.onChange({ target: { value: '  연금  ' } }); ui.draw();
  await ui.field('form').props.onSubmit({ preventDefault() {} }); ui.draw();
  assert.deepEqual(ui.calls, [['create', '연금']]);
  ui.button('장기 투자 이름 변경').props.onClick(); ui.draw();
  ui.field('input').props.onChange({ target: { value: '성장 투자' } }); ui.draw();
  await ui.field('form').props.onSubmit({ preventDefault() {} });
  assert.deepEqual(ui.calls[1], ['rename', 'two', '성장 투자']);
});
test('deletion with trades requires explicit other-portfolio destination', async () => {
  const ui = harness(); ui.draw(); ui.button('기본 포트폴리오 삭제').props.onClick(); let html = ui.draw();
  assert.match(html, /거래를 옮긴 뒤 삭제/);
  assert.equal(ui.button('옮기고 삭제').props.disabled, true);
  const target = ui.find(n => n.type === 'select' && n.props.required);
  assert.equal(nodes(target).filter(n => n.type === 'option' && n.props.value === 'one').length, 0);
  target.props.onChange({ target: { value: 'two' } }); ui.draw();
  await ui.field('form').props.onSubmit({ preventDefault() {} });
  assert.deepEqual(ui.calls, [['delete', 'one', 'two']]);
});
test('last portfolio and a read-only ledger cannot be deleted/managed', () => {
  const last = harness({ portfolios: [{ id: 'one', name: '기본 포트폴리오' }] }); last.draw();
  assert.equal(last.button('기본 포트폴리오 삭제').props.disabled, true);
  const readOnly = harness({ writable: false }); readOnly.draw();
  assert.equal(readOnly.button('포트폴리오 관리').props.disabled, true);
});
test('double submit is blocked and late account response does not publish success', async () => {
  let finish, count = 0;
  const ui = harness({ createPortfolio: async () => { count++; return await new Promise(resolve => { finish = resolve; }); } });
  ui.draw(); ui.button('새 포트폴리오').props.onClick(); ui.draw();
  const submit = ui.field('form').props.onSubmit;
  const pending = submit({ preventDefault() {} });
  await submit({ preventDefault() {} }); assert.equal(count, 1);
  ui.invalidate(); finish(null); await pending;
  assert.match(ui.draw(), /새 포트폴리오/);
});
test('selected data, CSV scope, and backup restoration scope stay connected', () => {
  const page = readFileSync('src/app/portfolio/page.tsx', 'utf8');
  assert.match(page, /\["포트폴리오", portfolioName\]/);
  assert.match(page, /key=\{selectedPortfolioId\}/);
  const backup = readFileSync('src/components/TransactionBackupPanel.tsx', 'utf8');
  assert.match(backup, /serializeTransactionBackup\(transactions, portfolios\)/);
  assert.match(backup, /importTransactions\(preview.transactions, mode, preview.portfolios\)/);
  assert.match(backup, /useAllTransactions\(\)/);
  const form = readFileSync('src/components/TransactionForm.tsx', 'utf8');
  assert.match(form, /saving \|\| isAggregate/);
  assert.match(form, /PortfolioSwitcher destination disabled=\{saving\}/);
});
