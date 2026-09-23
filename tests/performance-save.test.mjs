import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createClient } from '@supabase/supabase-js';
import ts from 'typescript';
import { loadTypescript } from './load-typescript.mjs';

const { runSupabaseRequest } = loadTypescript('src/features/auth/session-request.ts');
const source = ts.transpileModule(readFileSync('src/features/performance/repository.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const userId = '00000000-0000-4000-8000-000000000001';
const otherId = '00000000-0000-4000-8000-000000000002';
const startedAt = '2020-01-01T00:00:00Z';
const point = { date: '2020-01-01', assetValueKRW: 100, openingValueKRW: 0, twrIndex: 100, netFlowKRW: 100,
  cumulativeNetFlowKRW: 100, cumulativeProfitKRW: 0, active: true, final: true };
const history = { calculationVersion: 4, revision: 'r1', startedAt, points: [point] };
const input = { userId, revision: 'r1', today: '2020-01-01', transactions: [
  { id: 'trade', symbol: 'QA', name: 'QA', type: 'buy', date: '2020-01-01', createdAt: startedAt,
    price: 100, quantity: 1, fee: 0, currency: 'KRW', fxRateToKRW: 1 },
] };
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function fixture(t) {
  const deadline = new AbortController();
  const response = deferred(), requested = deferred();
  const writes = [], requests = [], limits = [];
  let account = userId, storageFailure = false;
  const client = createClient('https://performance-save.invalid', 'qa-publishable', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, init) => {
      requests.push({ url, signal: init.signal, body: JSON.parse(init.body), token: init.headers.get('Authorization') });
      requested.resolve();
      // Deliberately ignores cancellation to check that a late response cannot publish.
      return response.promise;
    } },
  });
  client.auth.getSession = async () => ({ data: { session: account ? {
    access_token: account + '-token', refresh_token: 'qa-refresh', user: { id: account },
  } : null }, error: null });
  t.after(() => response.resolve(Response.json(null)));
  const exports = {};
  const imports = {
    '@/features/auth/session-request': { runSupabaseRequest },
    '@/lib/branded-storage': { readBrandedStorage: () => null },
    '@/lib/supabase': { getSupabaseBrowserClient: () => client },
  };
  runInNewContext(source, {
    exports, require: name => { assert.ok(name in imports, name); return imports[name]; },
    Error, Date, JSON, Number, Array, Promise,
    AbortSignal: {
      any: signals => AbortSignal.any(signals),
      timeout: ms => { limits.push(ms); return deadline.signal; },
    },
    localStorage: { setItem: (key, value) => {
      if (storageFailure) throw new Error('storage unavailable');
      writes.push({ key, value: JSON.parse(value) });
    } },
  });
  const { loadPerformance } = loadTypescript('src/features/performance/service.ts', {
    './repository': { readHistory: async () => ({ saved: null, startedAt }), saveHistory: exports.saveHistory },
    './calculate': { calculateHistory: async () => [point] },
    '@/lib/stock-api': { getChartSeries: async () => ({ points: [{ date: '2019-12-31', close: 100 }] }) },
  });
  return { ...exports, loadPerformance, requests, requested: requested.promise, writes, limits,
    complete: (body = null, status = 200) => response.resolve(Response.json(body, { status })),
    timeout: () => deadline.abort(new DOMException('save deadline', 'TimeoutError')),
    account: value => { account = value; }, failStorage: () => { storageFailure = true; },
  };
}

test('internal save deadline returns calculated points with an unsynced local copy and never replays the write', async t => {
  const f = fixture(t), caller = new AbortController();
  const pending = f.loadPerformance(input, caller.signal);
  await f.requested;
  f.timeout();
  const result = await pending;
  assert.deepEqual(result.points, [point]);
  assert.match(result.error, /서버 저장에 실패/);
  assert.equal(caller.signal.aborted, false);
  assert.equal(f.requests[0].signal.aborted, true);
  assert.deepEqual(f.limits, [20_000]);
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].key, 'centbloom-performance-v2:' + userId);
  assert.equal(f.writes[0].value.serverSynced, false);
  assert.deepEqual(f.writes[0].value.points, [point]);
  f.complete();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(f.requests.length, 1);
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].value.serverSynced, false);
});

test('caller cancellation during save prevents a local copy and calculated result', async t => {
  const f = fixture(t), caller = new AbortController();
  const pending = f.loadPerformance(input, caller.signal);
  await f.requested;
  caller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(f.requests[0].signal.aborted, true);
  assert.equal(f.writes.length, 0);
  f.complete();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(f.writes.length, 0);
});

test('caller cancellation wins when the internal save deadline also expires', async t => {
  const f = fixture(t), caller = new AbortController();
  const pending = f.saveHistory(userId, history, history.points, caller.signal);
  await f.requested;
  f.timeout();
  caller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(f.writes.length, 0);
});

for (const next of [otherId, null]) {
  test(`an explicit ${next ? 'account switch' : 'logout'} during save is not hidden by cache fallback without caller cancellation`, async t => {
    const f = fixture(t), caller = new AbortController();
    const pending = f.loadPerformance(input, caller.signal);
    await f.requested;
    f.account(next);
    f.complete();
    await assert.rejects(pending, next ? /계정이 변경/ : /로그인이 만료/);
    assert.equal(caller.signal.aborted, false);
    assert.equal(f.writes.length, 0);
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].token, 'Bearer ' + userId + '-token');
  });
}

test('an already cancelled caller or wrong account never starts a save or local cache write', async t => {
  const f = fixture(t), caller = new AbortController();
  caller.abort();
  await assert.rejects(f.saveHistory(userId, history, history.points, caller.signal), { name: 'AbortError' });
  f.account(otherId);
  await assert.rejects(f.saveHistory(userId, history, history.points, new AbortController().signal), /계정이 변경/);
  assert.equal(f.requests.length, 0);
  assert.equal(f.writes.length, 0);
});

test('successful and rejected saves keep their existing cache status and warnings', async t => {
  for (const code of [null, 'PGRST202', '42501']) {
    const f = fixture(t);
    const pending = f.saveHistory(userId, history, history.points, new AbortController().signal);
    await f.requested;
    f.complete(code ? { code, message: 'storage unavailable' } : null, code ? 400 : 200);
    const warning = await pending;
    if (code) assert.match(warning, code === 'PGRST202' ? /서버 저장 업데이트/ : /서버 저장에 실패/);
    else assert.equal(warning, null);
    assert.equal(f.writes[0].value.serverSynced, !code);
    assert.equal(f.requests[0].body.expected_revision, history.revision);
    assert.deepEqual(f.requests[0].body.points, history.points);
    assert.equal(f.requests.length, 1);
  }
});

test('local cache failure remains visible after a completed server save', async t => {
  const f = fixture(t);
  f.failStorage();
  const pending = f.saveHistory(userId, history, history.points, new AbortController().signal);
  await f.requested;
  f.complete();
  assert.match(await pending, /브라우저 사본을 저장하지 못했습니다/);
  assert.equal(f.writes.length, 0);
});
