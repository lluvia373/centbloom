import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as jsxRuntime from 'react/jsx-runtime';
import ts from 'typescript';
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
      const frame = {
        slots: [], effects: [], index: 0,
        render(Component, props) { active = frame; frame.index = 0; return Component(props); },
        flush() { for (const effect of frame.effects.splice(0)) effect(); },
        unmount() { for (const slot of frame.slots) slot?.cleanup?.(); },
      };
      return frame;
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
      hasUnread: async () => true,
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

test('late visit, list or unread completion after account cleanup cannot publish another account or start another query', async () => {
  for (const waitingAt of ['visit', 'list', 'unread']) {
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
          hasUnread: () => waitingAt === 'unread' ? wait.promise : Promise.resolve(true),
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
    assert.equal(listCalls, 1, 'initial list starts independently, but no post-visit read starts after cleanup');
    assert.equal(render().props.value, null);
  }
});

function accountHarness(repository,document) {
  const hooks=hookHarness(),parent=hooks.frame();
  const overrides={
    react:hooks.react,
    'react/jsx-runtime':jsxRuntime,
    '@/hooks/useAuth':{useAuth:()=>({configured:true,loading:false,user:{id:'A'}})},
    './repository':{notificationRepository:repository},
  };
  const path='src/features/notifications/NotificationProvider.tsx';
  let exports;
  if(document){
    // This one browser-lifecycle test supplies a document to the isolated module;
    // the shared TypeScript loader intentionally has no browser globals.
    exports={};
    const {outputText}=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}});
    runInNewContext(outputText,{exports,require:name=>overrides[name],document,crypto,AbortController,console});
  }else exports=loadTypescript(path,overrides);
  const {NotificationProvider}=exports;
  const render=()=>parent.render(NotificationProvider,{children:'page'});
  const worker=render().props.children[1],frame=hooks.frame();
  frame.render(worker.type,worker.props);frame.flush();
  return {
    inbox(){frame.render(worker.type,worker.props);frame.flush();return render().props.value;},
    unmount(){frame.unmount();},
  };
}

test('existing rows appear before the visit finishes, then newly delivered rows and unread presence are refreshed', async () => {
  const visit=deferred(),ids=[];
  let synchronized=false,listCalls=0;
  const state=accountHarness(()=>({
    visit:id=>{ids.push(id);return visit.promise;},
    list:async()=>{listCalls++;return [{event_id:synchronized?'new-event':'saved-event',read_at:synchronized?null:'read'}];},
    hasUnread:async()=>synchronized,
  }));
  await settle();
  assert.equal(state.inbox().items[0].event_id,'saved-event');
  assert.equal(state.inbox().ready,true);
  assert.equal(state.inbox().pending,true);
  synchronized=true;visit.resolve({since:'2026-09-22',visitedAt:'2026-09-23'});await settle();
  assert.equal(state.inbox().items[0].event_id,'new-event');
  assert.equal(state.inbox().hasUnread,true);
  assert.equal(state.inbox().pending,false);
  assert.equal(listCalls,2);
  state.inbox().reload();await settle();
  assert.equal(listCalls,3,'subsequent refresh has one post-sync read, not two');
  assert.equal(ids[0],ids[1],'refresh does not advance the visit baseline');
  state.unmount();
});

test('unread state is independent of the displayed 50 rows and a query failure stays unknown', async () => {
  let fails=false;
  const state=accountHarness(()=>({
    visit:async()=>({since:null,visitedAt:'now'}),
    list:async()=>Array.from({length:50},(_,index)=>({event_id:String(index),read_at:'read'})),
    hasUnread:async()=>{if(fails)throw new Error('unread lookup failed');return true;},
  }));
  await settle();
  assert.equal(state.inbox().hasUnread,true,'an older unread event exists beyond the loaded page');
  assert.equal(state.inbox().more,true);
  fails=true;state.inbox().reload();await settle();
  const inbox=state.inbox();
  assert.equal(inbox.items.length,50);
  assert.equal(inbox.ready,true);
  assert.equal(inbox.error,null,'unread status failure does not hide the readable list');
  assert.equal(inbox.hasUnread,null);
  assert.equal(inbox.unreadError,'unread lookup failed');
  state.unmount();
});

test('failed read saves can be retried, successful saves recheck all unread events and ignore duplicate clicks', async () => {
  const row={event_id:'visible',read_at:null};
  let fails=true,readCalls=0,presenceCalls=0;
  const state=accountHarness(()=>({
    visit:async()=>({since:null,visitedAt:'now'}),
    list:async()=>[row],
    hasUnread:async()=>{presenceCalls++;return true;},
    markRead:async()=>{readCalls++;if(fails)throw new Error('save failed');},
  }));
  await settle();state.inbox().markRead(row);await settle();
  assert.equal(state.inbox().items[0].read_at,null);
  assert.equal(state.inbox().error,'save failed');
  fails=false;const before=presenceCalls;
  state.inbox().markRead(row);await settle();
  assert.ok(state.inbox().items[0].read_at);
  assert.equal(state.inbox().hasUnread,true,'reading the last visible event cannot clear older unread events');
  assert.equal(state.inbox().error,null);
  assert.equal(presenceCalls,before+1);
  state.inbox().markRead(row);await settle();
  assert.equal(readCalls,2,'a stale UI callback cannot repeat a confirmed successful save');
  state.unmount();
});

test('returning to a visible tab refreshes the same visit, without polling or a listener left after cleanup', async () => {
  const listeners=new Map(),ids=[];
  const document={visibilityState:'hidden',addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  const state=accountHarness(()=>({
    visit:async id=>{ids.push(id);return {since:null,visitedAt:'now'};},
    list:async()=>[],hasUnread:async()=>false,
  }),document);
  await settle();
  listeners.get('visibilitychange')();await settle();
  assert.equal(ids.length,1,'hidden tabs do not request updates');
  document.visibilityState='visible';listeners.get('visibilitychange')();await settle();
  assert.equal(ids.length,2);assert.equal(ids[0],ids[1]);
  state.unmount();assert.equal(listeners.size,0);
});

test('price conditions load separately, baseline evaluation emits no invented alert, and saving keeps its request identity', async () => {
  let rows=[{symbol:'AAPL',direction:'below',enabled:true,matched:null}],evaluations=0;
  const saves=[];
  const state=accountHarness(()=>({
    visit:async()=>({since:null,visitedAt:'now'}),list:async()=>[],hasUnread:async()=>false,
    priceAlerts:async()=>rows,
    evaluatePrices:async()=>{evaluations++;rows=rows.map(row=>({...row,matched:true}));return {emitted:0,unavailable:0};},
    savePriceAlerts:async(id,symbol,rules)=>{saves.push({id,symbol,rules});rows=rules.map(rule=>({...rule,symbol,matched:null}));return rows;},
  }));
  await settle();let inbox=state.inbox();
  assert.equal(inbox.pricesReady,true);assert.equal(inbox.priceAlerts[0].matched,true);
  assert.equal(inbox.items.length,0,'a baseline cannot create a UI alert');assert.equal(evaluations,1);
  const id=crypto.randomUUID(),rules=[{direction:'above',threshold:120,currency:'USD',enabled:true}];
  assert.equal(await inbox.savePrices('AAPL',rules,id),null);await settle();inbox=state.inbox();
  assert.equal(saves[0].id,id);assert.equal(inbox.priceAlerts[0].direction,'above');
  state.unmount();
  assert.match(await inbox.savePrices('AAPL',rules,id),/계정 연결/);
});

test('an aborted price request cannot publish account rows or start evaluation', async()=>{
  const wait=deferred();let evaluations=0;
  const state=accountHarness(()=>({
    visit:async()=>({since:null,visitedAt:'now'}),list:async()=>[],hasUnread:async()=>false,
    priceAlerts:()=>wait.promise,evaluatePrices:async()=>{evaluations++;return {emitted:0,unavailable:0};},
  }));
  await settle();state.unmount();wait.resolve([{symbol:'SECRET',enabled:true}]);await settle();
  assert.equal(evaluations,0);assert.equal(state.inbox().priceAlerts.length,0);
});
