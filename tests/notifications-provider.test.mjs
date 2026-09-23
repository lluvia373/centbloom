import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescript } from './load-typescript.mjs';

// The existing TypeScript loader and hook-mock pattern let us explicitly order
// renders, effect cleanup and late requests without a browser or real account.
function hookHarness() {
  let active;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const memo = (factory, deps) => {
    const index = active.index++;
    if (!same(active.slots[index]?.deps, deps)) active.slots[index] = { deps, value: factory() };
    return active.slots[index].value;
  };
  const react = {
    createContext: () => ({ Provider: 'context-provider' }),
    useContext: () => null,
    useMemo: memo,
    useCallback: (callback, deps) => memo(() => callback, deps),
    useState(initial) {
      const frame = active, index = frame.index++;
      if (!frame.slots[index]) {
        const slot = { value: typeof initial === 'function' ? initial() : initial };
        slot.set = value => { slot.value = typeof value === 'function' ? value(slot.value) : value; };
        frame.slots[index] = slot;
      }
      const slot = frame.slots[index];
      return [slot.value, slot.set];
    },
    useRef: initial => memo(() => ({ current: initial }), []),
    useEffect(effect, deps) {
      const frame = active, index = frame.index++;
      if (!same(frame.slots[index]?.deps, deps)) {
        const previous = frame.slots[index];
        const slot = { deps };
        frame.slots[index] = slot;
        frame.effects.push(() => { previous?.cleanup?.(); slot.cleanup = effect(); });
      }
    },
  };
  return {
    react,
    frame() {
      return {
        slots: [], effects: [], index: 0,
        render(Component, props) { active = this; this.index = 0; return Component(props); },
        flush() { for (const effect of this.effects.splice(0)) effect(); },
        unmount() { for (const slot of this.slots) slot?.cleanup?.(); },
      };
    },
  };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

test('auth restoration and account changes retain the page reconciliation slot and hide old inbox immediately', async () => {
  const hooks = hookHarness(), parent = hooks.frame(), visits = [];
  let auth = { configured: true, loading: true, user: null };
  const { NotificationProvider } = loadTypescript('src/features/notifications/NotificationProvider.tsx', {
    react: hooks.react,
    '@/hooks/useAuth': { useAuth: () => auth },
    './repository': { notificationRepository: (userId, signal) => ({
      visit: async id => { visits.push({ userId, signal, id }); return { since: null, visitedAt: '2026-09-23T00:00:00Z' }; },
      list: async () => [{ event_id: userId }],
    }) },
  });
  const children = { type: 'stateful-page', key: null, props: {} };
  const render = () => parent.render(NotificationProvider, { children });
  const initial = render();
  assert.equal(initial.props.value, null);
  auth = { ...auth, loading: false, user: { id: 'A' } };
  let tree = render();
  assert.equal(tree.type, initial.type);
  assert.equal(tree.props.children[0], children);
  const firstWorker = tree.props.children[1], first = hooks.frame();
  assert.equal(first.render(firstWorker.type, firstWorker.props), null);
  first.flush(); await settle();
  first.render(firstWorker.type, firstWorker.props); first.flush();
  tree = render();
  assert.equal(tree.props.value.items[0].event_id, 'A');
  const oldInbox = tree.props.value;
  oldInbox.reload(); await settle();
  assert.equal(visits[0].id, visits[1].id, 'reload retains this visit window');

  auth = { ...auth, user: { id: 'B' } };
  tree = render();
  assert.equal(tree.type, initial.type);
  assert.equal(tree.props.children[0], children);
  assert.equal(tree.props.value, null, 'hide A even before cleanup/effects');
  first.unmount();
  assert.equal(visits[0].signal.aborted, true);
  oldInbox.reload(); await settle();
  assert.equal(visits.length, 2, 'stale callbacks do not restart aborted work');

  // B need not publish before returning to A: the old A snapshot must stay hidden.
  auth = { ...auth, user: { id: 'A' } };
  tree = render();
  assert.equal(tree.props.value, null);
  const nextWorker = tree.props.children[1], next = hooks.frame();
  next.render(nextWorker.type, nextWorker.props); next.flush(); await settle();
  next.render(nextWorker.type, nextWorker.props); next.flush();
  tree = render();
  assert.equal(tree.props.value.items[0].event_id, 'A');
  assert.notEqual(visits[2].id, visits[0].id, 'a new account session owns a new visit ID');
  auth = { ...auth, user: null };
  tree = render();
  assert.equal(tree.props.value, null);
  assert.equal(tree.type, initial.type);
  assert.equal(tree.props.children[0], children);
  next.unmount();
  assert.equal(visits[2].signal.aborted, true);
});

test('late visit or list completion after account cleanup cannot publish another account or start another query', async () => {
  for (const waitingAt of ['visit', 'list']) {
    const hooks = hookHarness(), parent = hooks.frame(), wait = deferred();
    let auth = { configured: true, loading: false, user: { id: 'A' } }, listCalls = 0, signal;
    const { NotificationProvider } = loadTypescript('src/features/notifications/NotificationProvider.tsx', {
      react: hooks.react,
      '@/hooks/useAuth': { useAuth: () => auth },
      './repository': { notificationRepository: (_userId, requestSignal) => {
        signal = requestSignal;
        return {
          visit: () => waitingAt === 'visit' ? wait.promise : Promise.resolve({ since: null, visitedAt: 'now' }),
          list: () => { listCalls++; return wait.promise; },
        };
      } },
    });
    const render = () => parent.render(NotificationProvider, { children: 'page' });
    const worker = render().props.children[1], frame = hooks.frame();
    frame.render(worker.type, worker.props); frame.flush(); await settle();
    auth = { ...auth, user: { id: 'B' } };
    assert.equal(render().props.value, null);
    frame.unmount();
    assert.equal(signal.aborted, true);
    wait.resolve(waitingAt === 'visit' ? { since: null, visitedAt: 'late' } : [{ event_id: 'old-A' }]);
    await settle();
    assert.equal(listCalls, waitingAt === 'visit' ? 0 : 1);
    assert.equal(render().props.value, null);
  }
});
