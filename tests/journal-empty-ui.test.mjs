import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadTypescript } from './load-typescript.mjs';

const sentiments = ['관찰', '매수 검토', '복기'];
const entry = (id, sentiment = '관찰') => ({
  id, title: `노트 ${id}`, body: `본문 ${id}`, symbol: 'AAA', sentiment,
  createdAt: '2026-09-22T01:00:00.000Z', updatedAt: '2026-09-22T01:00:00.000Z',
});

function workspace(initial = {}) {
  const calls = [];
  const controller = {
    entries: [], filtered: [], ready: true, storageError: null,
    query: '', filter: '전체', oldestFirst: false,
    editorOpen: false, editingId: undefined,
    draft: { title: '', symbol: '', body: '', sentiment: '관찰' },
    formError: null, notice: null, pendingDelete: null,
    editorRef: { current: null },
    setQuery: value => calls.push(['query', value]),
    setFilter: value => calls.push(['filter', value]),
    setOldestFirst: value => calls.push(['sort', value]),
    setDraft: value => calls.push(['draft', value]),
    setPendingDelete: value => calls.push(['pendingDelete', value]),
    openEditor: (...args) => { calls.push(['open', ...args]); controller.editorOpen = true; },
    closeEditor: () => calls.push(['close']),
    submit: event => calls.push(['submit', event]),
    remove: id => calls.push(['remove', id]),
    ...initial,
  };
  const cards = [];
  let editorProps;
  const { JournalEditor } = loadTypescript('src/features/journal/JournalEditor.tsx', {
    '@/hooks/useJournal': { JOURNAL_SENTIMENTS: sentiments },
  });
  const { default: Page } = loadTypescript('src/app/journal/page.tsx', {
    './JournalPage.module.css': { default: new Proxy({}, { get: (_, key) => String(key) }) },
    '@/hooks/useAuth': { useAuth: () => ({ user: { id: 'journal-test' } }) },
    '@/hooks/useJournal': { JOURNAL_SENTIMENTS: sentiments },
    '@/features/journal/use-journal-controller': { useJournalController: () => controller },
    '@/features/journal/JournalEditor': {
      JournalEditor: props => { editorProps = props; return React.createElement(JournalEditor, props); },
    },
    '@/features/journal/JournalEntryCard': {
      JournalEntryCard: props => {
        cards.push(props);
        return React.createElement('article', { 'data-note-id': props.entry.id }, props.entry.title);
      },
    },
  });
  const tree = () => { const root = Page(); return root.type(root.props); };
  function* nodes(node) {
    if (Array.isArray(node)) { for (const child of node) yield* nodes(child); }
    else if (React.isValidElement(node)) { yield node; yield* nodes(node.props.children); }
  }
  return {
    controller, calls, cards,
    html: () => renderToStaticMarkup(React.createElement(Page)),
    find: predicate => [...nodes(tree())].find(predicate),
    editor: () => editorProps,
  };
}

const recordTools = /기록한 생각|살펴보는 종목|되돌아본 투자|나의 기록|노트 분류 필터|투자 노트 검색|최근 수정순|오래된 순/;
const storageNotice = '이 브라우저에 계정별 저장 · 브라우저 데이터 삭제 시 노트 삭제';

test('journal empty: shows only the empty state, one write action and storage scope', () => {
  const ui = workspace();
  const html = ui.html();
  assert.match(html, /작성한 노트 없음/);
  assert.ok(html.includes(storageNotice));
  assert.doesNotMatch(html, recordTools);
  assert.doesNotMatch(html, /일치하는 노트가 없어요|필터 초기화/);
  assert.equal((html.match(/<button\b/g) ?? []).length, 1);
  const write = ui.find(node => node.type === 'button');
  assert.equal(write.props.disabled, false);
  assert.equal(write.props.type, 'button');
  assert.match(write.props.className, /button-primary/);
  assert.match(write.props.className, /control/);
});

test('journal loading: does not announce an empty ledger or expose record tools', () => {
  for (const entries of [[], [entry('loading')]]) {
    const ui = workspace({ ready: false, entries });
    const html = ui.html();
    assert.match(html, /role="status"[^>]*>노트를 불러오고 있어요\./);
    assert.doesNotMatch(html, /작성한 노트 없음|일치하는 노트가 없어요/);
    assert.doesNotMatch(html, recordTools);
    assert.equal(ui.find(node => node.type === 'button').props.disabled, true);
    assert.ok(html.includes(storageNotice));
  }
});

test('journal storage failure: empty unread data is not presented as no saved notes', () => {
  for (const ready of [false, true]) {
    const ui = workspace({ ready, storageError: '노트 저장소를 읽을 수 없습니다.', notice: '원본 기록을 유지합니다.' });
    const html = ui.html();
    assert.match(html, /role="alert"[^>]*>노트 저장소를 읽을 수 없습니다\./);
    assert.match(html, /role="status"/);
    assert.match(html, /원본 기록을 유지합니다\./);
    assert.doesNotMatch(html, /작성한 노트 없음|일치하는 노트가 없어요/);
    assert.doesNotMatch(html, recordTools);
    assert.equal(ui.find(node => node.type === 'button').props.disabled, true);
    assert.ok(html.includes(storageNotice));
  }
});

test('journal entries: summary and all existing tools and entry actions remain available', () => {
  const entries = [entry('one'), entry('two', '복기')];
  const ui = workspace({ entries, filtered: entries });
  const html = ui.html();
  for (const label of ['기록한 생각', '살펴보는 종목', '되돌아본 투자', '나의 기록', '최근 수정순', '노트 분류 필터', '투자 노트 검색']) {
    assert.ok(html.includes(label), label);
  }
  assert.equal(ui.cards.length, 2);
  for (const card of ui.cards) {
    assert.equal(card.openEditor, ui.controller.openEditor);
    assert.equal(card.remove, ui.controller.remove);
    assert.equal(card.setPendingDelete, ui.controller.setPendingDelete);
  }
  ui.find(node => node.type === 'input').props.onChange({ target: { value: 'AAA' } });
  ui.find(node => node.type === 'button' && node.props['aria-pressed'] === false && node.props.children === '복기').props.onClick();
  ui.find(node => node.type === 'button' && Array.isArray(node.props.children) && node.props.children.includes('최근 수정순')).props.onClick();
  assert.deepEqual(ui.calls, [['query', 'AAA'], ['filter', '복기'], ['sort', true]]);
});

test('journal filtered empty: keeps existing record tools and resets both query and classification', () => {
  const ui = workspace({ entries: [entry('one')], filtered: [], query: 'not found', filter: '복기' });
  const html = ui.html();
  assert.match(html, /일치하는 노트가 없어요/);
  assert.doesNotMatch(html, /작성한 노트 없음/);
  assert.match(html, recordTools);
  ui.find(node => node.type === 'button' && node.props.children === '필터 초기화').props.onClick();
  assert.deepEqual(ui.calls, [['filter', '전체'], ['query', '']]);
});

test('journal write: retains the existing editor handler, focus ref, draft and form feedback', () => {
  const ui = workspace();
  const write = ui.find(node => node.type === 'button');
  assert.notEqual(write.props.tabIndex, -1);
  write.props.onClick();
  assert.deepEqual(ui.calls, [['open']]);
  assert.equal(ui.controller.editorOpen, true);
  ui.controller.draft = { title: '작성 중인 제목', symbol: 'AAA', body: '작성 중인 내용', sentiment: '관찰' };
  ui.controller.formError = '제목 확인 필요';
  ui.controller.storageError = '저장 실패';
  const html = ui.html();
  assert.match(html, /id="note-title"/);
  assert.match(html, /value="작성 중인 제목"/);
  assert.match(html, /작성 중인 내용/);
  assert.match(html, /제목 확인 필요/);
  assert.match(html, /저장 실패/);
  assert.equal(ui.editor().editorRef, ui.controller.editorRef);
  assert.equal(ui.editor().submit, ui.controller.submit);
  assert.equal(ui.editor().setDraft, ui.controller.setDraft);
  assert.equal(ui.editor().closeEditor, ui.controller.closeEditor);
});

test('journal storage failure with known entries: retains the readable notes and tools', () => {
  const entries = [entry('retained')];
  const ui = workspace({ entries, filtered: entries, storageError: '저장 실패', notice: '기록 보존' });
  const html = ui.html();
  assert.match(html, /노트 retained/);
  assert.match(html, recordTools);
  assert.match(html, /저장 실패/);
  assert.match(html, /기록 보존/);
  assert.doesNotMatch(html, /작성한 노트 없음|일치하는 노트가 없어요/);
});

test('journal styles: shared tokens and 44px controls preserve wrapping and a count-free heading', () => {
  const entries = [entry('style')];
  const ui = workspace({ entries, filtered: entries });
  assert.equal(ui.find(node => node.type === 'h2').props.children, '나의 기록');
  const filters = ui.find(node => node.props['aria-label'] === '노트 분류 필터');
  assert.match(filters.props.className, /\bflex-wrap\b/);
  assert.match(filters.props.className, /\bmin-w-0\b/);
  assert.equal(ui.find(node => node.type === 'button' && !node.props.className.includes('control')), undefined);
  assert.equal(ui.find(node => node.type === 'input').props.className, 'text-cf-input');
  const css = readFileSync(new URL('../src/app/journal/JournalPage.module.css', import.meta.url), 'utf8');
  const control = css.match(/\.page \.control\s*\{([^}]+)\}/)?.[1];
  assert.match(control, /min-height:\s*calc\(var\(--cf-space-12\) - var\(--cf-space-1\)\)/);
  assert.match(control, /font-size:\s*var\(--cf-text-label\)/);
  assert.match(control, /border-radius:\s*var\(--cf-radius-control\)/);
  assert.match(css, /\.page \.control:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--cf-color-focus\)/);
  const search = css.match(/\.search\s*\{([^}]+)\}/)?.[1];
  assert.match(search, /width:\s*100%/);
  assert.match(search, /min-width:\s*0/);
  const input = css.match(/\.search input\s*\{([^}]+)\}/)?.[1];
  assert.match(input, /min-width:\s*0/);
  assert.match(input, /font-size:\s*var\(--cf-text-input\)/);
  assert.match(input, /min-height:\s*calc\(var\(--cf-space-12\) - var\(--cf-space-1\)\)/);
  assert.match(css, /\.search:focus-within\s*\{[^}]*outline:\s*2px solid var\(--cf-color-focus\)/);
  const source = readFileSync(new URL('../src/app/journal/page.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\[#[a-fA-F0-9]+\]|\btext-(?:xs|sm|base|lg|xl|2xl)\b|\brounded-(?:md|lg|xl|2xl)\b|\b(?:p|px|py|space-y)-5\b|\b(?:gap|ml|py)-1\.5\b|\b(?:h|w)-3\.5\b/);
  const noResults = workspace({ entries, filtered: [], query: 'missing' });
  const reset = noResults.find(node => node.type === 'button' && node.props.children === '필터 초기화');
  assert.match(reset.props.className, /button-secondary/);
  assert.match(reset.props.className, /control/);
});
