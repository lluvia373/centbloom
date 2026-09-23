import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadTypescript } from './load-typescript.mjs';

const nodes = value => Array.isArray(value) ? value.flatMap(nodes)
  : React.isValidElement(value) ? [value, ...nodes(value.props.children)] : [];

function detailsHarness(instanceId = 'details-test') {
  const state = [];
  let cursor = 0;
  let tree;
  let focused = null;
  const focusCalls = [];
  const buttonRefs = { current: [] };
  const input = {
    holdings: React.createElement('input', { 'aria-label': '보유종목 검색', defaultValue: 'Apple' }),
    history: React.createElement('button', null, '연도별'),
  };
  const { PortfolioDetails } = loadTypescript('src/features/portfolio/ui/PortfolioDetails.tsx', {
    react: {
      ...React,
      useId: () => instanceId,
      useRef: () => buttonRefs,
      useState: initial => {
        const index = cursor++;
        if (!(index in state)) state[index] = initial;
        return [state[index], value => { state[index] = value; }];
      },
    },
    './PortfolioDetails.module.css': { default: {
      details: 'details', tabs: 'tabs', tab: 'tab', panel: 'panel',
    } },
  });
  const byRole = role => nodes(tree).filter(node => node.props.role === role);
  return {
    input, focusCalls,
    draw() {
      cursor = 0;
      tree = PortfolioDetails(input);
      byRole('tab').forEach((tab, index) => tab.props.ref({
        focus(options) { focused = index; focusCalls.push(options); },
      }));
      return renderToStaticMarkup(tree);
    },
    tabs: () => byRole('tab'),
    panels: () => byRole('tabpanel'),
    selected: () => byRole('tab').findIndex(tab => tab.props['aria-selected']),
    focus: () => focused,
    click(index) { byRole('tab')[index].props.onClick(); },
    key(index, key, modifiers = {}) {
      let prevented = false;
      byRole('tab')[index].props.onKeyDown({
        key, ...modifiers, preventDefault() { prevented = true; },
      });
      return prevented;
    },
  };
}

test('details defaults to holdings and connects one selected tab to one visible panel', () => {
  const h = detailsHarness();
  const html = h.draw();
  assert.match(html, /role="tablist" aria-label="투자 상세 보기"/);
  assert.deepEqual(h.tabs().map(tab => tab.props.children), ['보유종목', '투자 성과']);
  assert.equal(h.selected(), 0);
  assert.deepEqual(h.tabs().map(tab => tab.props.tabIndex), [0, -1]);
  assert.deepEqual(h.panels().map(panel => panel.props.hidden), [false, true]);
  for (let index = 0; index < 2; index++) {
    const tab = h.tabs()[index];
    const panel = h.panels()[index];
    assert.equal(tab.props['aria-controls'], panel.props.id);
    assert.equal(panel.props['aria-labelledby'], tab.props.id);
    assert.equal(panel.props.tabIndex, 0);
    assert.equal(tab.props.type, 'button');
  }
});

test('clicking each detail retains all supplied children and tab geometry without scrolling', () => {
  const h = detailsHarness();
  h.draw();
  const children = h.panels().map(panel => panel.props.children);
  const ids = h.panels().map(panel => panel.props.id);
  for (const selected of [1, 0, 1]) {
    h.click(selected);
    const html = h.draw();
    assert.equal(h.selected(), selected);
    assert.equal(h.focus(), null, 'pointer clicks retain native browser focus behavior');
    assert.deepEqual(h.panels().map(panel => panel.props.hidden), [0, 1].map(i => i !== selected));
    assert.deepEqual(h.panels().map(panel => panel.props.id), ids);
    h.panels().forEach((panel, index) => assert.equal(panel.props.children, children[index]));
    assert.match(html, /보유종목 검색/);
    assert.match(html, /연도별/);
    assert.equal((html.match(/class="tab"/g) || []).length, 2);
  }
  assert.equal(h.focusCalls.length, 0);
});

test('arrow keys wrap and Home End select with focus while unrelated keys remain native', () => {
  const h = detailsHarness();
  h.draw();
  for (const [key, expected] of [
    ['ArrowLeft', 1], ['ArrowRight', 0], ['ArrowRight', 1], ['Home', 0], ['End', 1], ['Home', 0],
  ]) {
    assert.equal(h.key(h.selected(), key), true);
    h.draw();
    assert.equal(h.selected(), expected);
    assert.equal(h.focus(), expected);
    assert.deepEqual(h.tabs().map(tab => tab.props.tabIndex), [0, 1].map(i => i === expected ? 0 : -1));
  }
  for (const key of ['Tab', 'ArrowDown', 'ArrowUp', 'Escape']) {
    assert.equal(h.key(0, key), false);
    h.draw();
    assert.equal(h.selected(), 0);
  }
  for (const modifier of ['altKey', 'ctrlKey', 'metaKey']) {
    assert.equal(h.key(0, 'ArrowRight', { [modifier]: true }), false);
    h.draw();
    assert.equal(h.selected(), 0);
  }
});

test('detail labels contain no count badge or nested heading', () => {
  const h = detailsHarness();
  const html = h.draw();
  assert.deepEqual(h.tabs().map(tab => tab.props.children), ['보유종목', '투자 성과']);
  assert.doesNotMatch(html, /자산 구성|class="count"|종목 수|<h[1-6]/);
});

test('instance identifiers cannot collide and rerendering data does not reset the chosen tab', () => {
  const first = detailsHarness('first');
  const second = detailsHarness('second');
  first.draw(); second.draw();
  const firstIds = [...first.tabs(), ...first.panels()].map(node => node.props.id);
  const secondIds = [...second.tabs(), ...second.panels()].map(node => node.props.id);
  assert.equal(new Set([...firstIds, ...secondIds]).size, 8);
  first.click(1); first.draw();
  first.input.holdings = React.createElement('input', { 'aria-label': '새 보유종목 검색' });
  first.draw();
  assert.equal(first.selected(), 1);
  assert.equal(second.selected(), 0);
});

test('hidden panels are explicitly removed from layout and controls meet the shared design contract', () => {
  const source = readFileSync(new URL('../src/features/portfolio/ui/PortfolioDetails.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/features/portfolio/ui/PortfolioDetails.module.css', import.meta.url), 'utf8');
  assert.match(css, /\.panel\[hidden\]\s*\{\s*display:\s*none;/);
  assert.match(css, /min-height:\s*calc\(var\(--cf-space-12\) - var\(--cf-space-1\)\)/);
  assert.match(css, /\.tab:focus-visible/);
  assert.match(css, /\.panel:focus-visible/);
  assert.match(css, /border-radius:\s*var\(--cf-radius-card\)/);
  assert.match(css, /\.tab\[aria-selected="true"\]\s*\{\s*background:\s*var\(--cf-color-soft\)/);
  assert.match(css, /\.tab:focus:not\(:focus-visible\)\s*\{\s*outline:\s*none/);
  assert.doesNotMatch(css, /::after/);
  assert.doesNotMatch(css, /\.panel\s*\{[^}]*min-height/);
  assert.doesNotMatch(source, /<details|<summary|aria-expanded|scrollIntoView|localStorage|fetch\(/);
});
