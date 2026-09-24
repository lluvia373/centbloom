import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescript } from './load-typescript.mjs';

const settle = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function setup(t, response = () => new Promise(() => {})) {
  const deadlines = [], calls = [];
  t.mock.method(AbortSignal, 'timeout', ms => {
    assert.equal(ms, 20_000);
    const controller = new AbortController(); deadlines.push(controller); return controller.signal;
  });
  let account = 'A';
  const query = (name, payload) => {
    const call = { name, payload }; calls.push(call);
    const task = response(call);
    const builder = {
      select(columns) { call.columns=columns;return this; },
      eq(column,value) { (call.equals??=[]).push([column,value]);return this; },
      is(column,value) { call.is=[column,value];return this; },
      limit(value) { call.limit=value;return this; }, maybeSingle() { return this; },
      abortSignal(signal) { call.signal = signal; return this; },
      setHeader(name, value) { call[name] = value; return this; },
      then(resolve, reject) { return Promise.resolve(task).then(resolve, reject); },
    };
    return builder;
  };
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: account }, access_token: 'test-token' } }, error: null }) },
    rpc: query,
    from: name => query(name, {}),
  };
  const { notificationRepository } = loadTypescript('src/features/notifications/repository.ts', {
    '@/lib/supabase': { getSupabaseBrowserClient: () => client },
  });
  return { client, calls, deadlines, notificationRepository, setAccount: value => { account = value; } };
}

for (const [method, args] of [
  ['visit', ['visit-id']], ['list', []], ['hasUnread', []], ['markRead', ['event-id']],
  ['follow', ['request-id', 'guru', true]], ['followed', ['guru']],
]) {
  test(`${method} bounds an unresponsive request without aborting its caller`, async t => {
    const state = setup(t), caller = new AbortController();
    const pending = state.notificationRepository('A', caller.signal)[method](...args);
    const rejected = assert.rejects(pending, error => error.name === 'TimeoutError');
    await settle();
    assert.equal(state.calls.length, 1);
    assert.notEqual(state.calls[0].signal, caller.signal);
    state.deadlines[0].abort(new DOMException('Request deadline', 'TimeoutError'));
    await rejected;
    assert.equal(state.calls[0].signal.aborted, true);
    assert.equal(caller.signal.aborted, false);
  });
}

test('visit and list share one deadline, while a subsequent operation gets a fresh deadline', async t => {
  const state = setup(t, call => call.name === 'visit_notifications'
    ? Promise.resolve({ data: { since: null, visitedAt: 'now' }, error: null })
    : new Promise(() => {}));
  const caller = new AbortController(), repo = state.notificationRepository('A', caller.signal);
  await repo.visit('visit-id');
  const pending = repo.list(), rejected = assert.rejects(pending, error => error.name === 'TimeoutError');
  await settle();
  assert.equal(state.deadlines.length, 1);
  assert.equal(state.calls[0].signal, state.calls[1].signal);
  state.deadlines[0].abort(new DOMException('Request deadline', 'TimeoutError'));
  await rejected;
  state.notificationRepository('A', caller.signal);
  assert.equal(state.deadlines.length, 2);
  assert.equal(state.deadlines[1].signal.aborted, false);
});

test('the deadline also bounds session lookup before any SDK query starts', async t => {
  const state = setup(t);
  state.client.auth.getSession = () => new Promise(() => {});
  const pending = state.notificationRepository('A', new AbortController().signal).followed('guru');
  const rejected = assert.rejects(pending, error => error.name === 'TimeoutError');
  state.deadlines[0].abort(new DOMException('Request deadline', 'TimeoutError'));
  await rejected;
  assert.equal(state.calls.length, 0);
});

test('caller cancellation retains its reason and rejects a late response', async t => {
  const wait = deferred(), state = setup(t, () => wait.promise), caller = new AbortController();
  const pending = state.notificationRepository('A', caller.signal).follow('request-id', 'guru', true);
  const reason = new DOMException('Account switched', 'AbortError');
  const rejected = assert.rejects(pending, error => error === reason);
  await settle(); caller.abort(reason); await rejected;
  assert.equal(state.deadlines[0].signal.aborted, false);
  assert.equal(state.calls[0].signal.aborted, true);
  wait.resolve({ data: true, error: null }); await settle();
  assert.equal(state.calls.length, 1, 'an ambiguous cancelled mutation is not replayed');
});

test('account changes still reject otherwise successful responses without caller cancellation', async t => {
  const wait = deferred(), state = setup(t, () => wait.promise);
  const pending = state.notificationRepository('A', new AbortController().signal).followed('guru');
  const rejected = assert.rejects(pending, /계정이 변경/);
  await settle(); state.setAccount('B'); wait.resolve({ data: { active: true }, error: null });
  await rejected;
});

test('unread presence checks the owning account across all deliveries, not the latest page', async t => {
  const state=setup(t,()=>({data:[{event_id:'older-than-first-50'}],error:null}));
  assert.equal(await state.notificationRepository('A',new AbortController().signal).hasUnread(),true);
  assert.equal(state.calls[0].name,'account_notifications');
  assert.equal(state.calls[0].columns,'event_id');
  assert.deepEqual(state.calls[0].equals,[['user_id','A']]);
  assert.deepEqual(state.calls[0].is,['read_at',null]);
  assert.equal(state.calls[0].limit,1);
});

test('an empty unread query means none; failed or malformed results never mean none', async t => {
  let response={data:[],error:null};
  const state=setup(t,()=>response),repo=state.notificationRepository('A',new AbortController().signal);
  assert.equal(await repo.hasUnread(),false);
  response={data:null,error:{code:'42501',message:'denied'}};
  await assert.rejects(repo.hasUnread(),/새 알림 여부/);
  response={data:null,error:null};
  await assert.rejects(repo.hasUnread(),/새 알림 여부/);
});

test('price HTTP checks pin the account and reject a late response after account switching', async t => {
  const state=setup(t),wait=deferred();let authorization;
  t.mock.method(globalThis,'fetch',async(_url,options)=>{authorization=options.headers.Authorization;return wait.promise;});
  const pending=state.notificationRepository('A',new AbortController().signal).evaluatePrices();
  const rejected=assert.rejects(pending,/계정이 변경/);
  await settle();assert.equal(authorization,'Bearer test-token');state.setAccount('B');
  wait.resolve({ok:true,json:async()=>({evaluated:1,emitted:1,unavailable:0})});await rejected;
});
