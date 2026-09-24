import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadTypescript } from './load-typescript.mjs';

const css = { default: new Proxy({}, { get: (_, key) => String(key) }) };
const Link = ({ children, ...props }) => React.createElement('a', props, children);
const auth = { loading: false, configured: true, user: { id: 'A', email: 'a@example.test', user_metadata: { full_name: '긴 이름으로 확인하는 계정' } }, signOut: async () => {} };
const inbox = { items: [], ready: true, pending: false, error: null, unreadError: null, hasUnread: false, reload() {}, markRead() {} };
function load(state = auth, notifications = inbox, react = React) {
  return loadTypescript('src/features/navigation/HeaderAccountControls.tsx', {
    react,
    'next/link': { default: Link },
    '@/hooks/useAuth': { useAuth: () => state },
    '@/features/notifications/NotificationProvider': { useNotificationInbox: () => notifications },
    './header-account-controls.module.css': css,
  }).HeaderAccountControls;
}
const html = Component => renderToStaticMarkup(React.createElement(Component));

test('restoring auth never flashes login or exposes the previous account, guest has one login action', () => {
  const loading = html(load({ ...auth, loading: true }));
  assert.match(loading, /계정 확인 중/);
  assert.doesNotMatch(loading, /로그인|계정 메뉴|a@example|unreadDot/);
  const guest = html(load({ ...auth, user: null }));
  assert.match(guest, /href="\/portfolio"/);
  assert.equal((guest.match(/로그인/g) ?? []).length, 1);
  assert.doesNotMatch(guest, /계정 메뉴|unreadDot|알림/);
});
test('local mode keeps settings access without inventing login or personal notifications', () => {
  const result = html(load({ ...auth, configured: false, user: null }));
  assert.match(result, /aria-label="계정 메뉴"/);
  assert.doesNotMatch(result, /로그인|알림|unreadDot|a@example/);
});
test('bell uses confirmed unread presence, never the count of loaded rows, and mobile links to the inbox', () => {
  for (const hasUnread of [true, false, null]) {
    const result = html(load(auth, { ...inbox, hasUnread }));
    assert.match(result, /href="\/notifications"/);
    assert.equal(result.includes('unreadDot'), hasUnread === true);
    assert.equal(result.includes('읽지 않은 알림 있음'), hasUnread === true);
    assert.doesNotMatch(result, />0<|>50<|a@example/);
  }
  assert.match(html(load(auth, { ...inbox, hasUnread: null, unreadError: 'failed' })), /새 알림 확인 필요/);
});

function harness(state = auth, notifications = inbox) {
  const slots = []; let index = 0;
  const react = { ...React, useEffect() {}, useId: () => 'panel', useRef(initial) { const i=index++; return slots[i] ??= { current: initial }; }, useState(initial) {
    const i=index++; if (!(i in slots)) slots[i] = initial;
    return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
  } };
  const wrapper = load(state, notifications, react);
  const entry = wrapper();
  return { render() { index=0; return entry.type(entry.props); } };
}
function all(element, predicate) {
  if (!element || typeof element !== 'object') return [];
  const found = predicate(element) ? [element] : [];
  for (const child of React.Children.toArray(element.props?.children)) found.push(...all(child, predicate));
  return found;
}
test('account and notifications are mutually exclusive; opening only refreshes and never marks read', () => {
  let reloads=0, reads=0;
  const view=harness(auth, { ...inbox, reload() { reloads++; }, markRead() { reads++; } });
  const press = label => all(view.render(), node => node.type === 'button' && node.props['aria-label'] === label)[0].props.onClick({ detail: 0 });
  press('알림');
  assert.equal(reloads, 1); assert.equal(reads, 0);
  assert.equal(all(view.render(), node => node.props?.role === 'dialog')[0].props['aria-label'], '최근 알림');
  press('계정 메뉴');
  assert.equal(all(view.render(), node => node.props?.role === 'dialog').length, 1);
  assert.equal(all(view.render(), node => node.props?.role === 'dialog')[0].props['aria-label'], '계정 메뉴');
  press('계정 메뉴');
  assert.equal(all(view.render(), node => node.props?.role === 'dialog').length, 0);
});
test('preview preserves failures, shows at most five real events, and keeps the full list available', () => {
  for (const mode of ['loading', 'syncing', 'empty', 'failure', 'rows']) {
    const data={ ...inbox, ready: mode !== 'loading', pending: mode === 'syncing', error: mode === 'failure' ? '조회 실패' : null,
      items: mode === 'rows' ? Array.from({ length: 6 }, (_, i) => ({ event_id: String(i), subject_id:'AAPL', kind:'watch_change', title:`이벤트 ${i}`, occurred_at:'2026-09-23T00:00:00Z', read_at: i === 0 ? 'read' : null })) : [] };
    const view=harness(auth, data);
    all(view.render(), node => node.type === 'button' && node.props['aria-label'] === '알림')[0].props.onClick({ detail: 0 });
    const preview=all(view.render(), node => typeof node.type === 'function' && 'inbox' in (node.props ?? {}))[0];
    const result=renderToStaticMarkup(React.createElement(preview.type, preview.props));
    assert.match(result, /전체 보기/);
    if (mode === 'loading' || mode === 'syncing') { assert.match(result, /알림 확인 중/); assert.doesNotMatch(result, /아직 받은 알림/); }
    if (mode === 'empty') assert.match(result, /아직 받은 알림이 없어요/);
    if (mode === 'failure') { assert.match(result, /조회 실패|다시 확인/); assert.doesNotMatch(result, /아직 받은 알림/); }
    if (mode === 'rows') { assert.equal((result.match(/<li>/g) ?? []).length, 5); assert.doesNotMatch(result, /이벤트 5/); assert.match(result, /읽지 않음/); }
  }
});
test('logout double-click is coalesced, failure retains account and offers retry', async () => {
  let reject, calls=0;
  const view=harness({ ...auth, signOut: () => { calls++; return new Promise((_, fail) => { reject=fail; }); } });
  all(view.render(), node => node.type === 'button' && node.props['aria-label'] === '계정 메뉴')[0].props.onClick({ detail: 0 });
  const logout=all(view.render(), node => node.type === 'button' && React.Children.toArray(node.props.children).includes('로그아웃'))[0];
  logout.props.onClick(); logout.props.onClick();
  assert.equal(calls, 1);
  reject(new Error('network')); await new Promise(resolve => setImmediate(resolve));
  const alerts=all(view.render(), node => node.props?.role === 'alert');
  assert.equal(alerts.length, 1); assert.match(alerts[0].props.children, /로그아웃하지 못했습니다/);
  assert.ok(all(view.render(), node => node.type === 'button' && React.Children.toArray(node.props.children).includes('로그아웃')).length);
});
test('primary navigation has no duplicate settings destination after moving account controls', () => {
  const { primaryNavigation, navigationArea } = loadTypescript('src/features/navigation/model.ts');
  assert.deepEqual(Array.from(primaryNavigation, item => item.href), ['/', '/portfolio', '/gurus']);
  assert.equal(navigationArea('/settings'), 'settings');
});
