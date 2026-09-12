import test from "node:test";
import assert from "node:assert/strict";
import { loadTypescript } from "./load-typescript.mjs";

const { createWatchlistStore } = loadTypescript("src/features/watchlist/store.ts");
const { applyWatchlistCommand, parseStoredWatchlist } = loadTypescript("src/features/watchlist/model.ts");
const item = (symbol = "AAPL") => ({ symbol, name: symbol, targetPrice: null, targetCurrency: null, addedAt: "2026-09-12T00:00:00Z" });
const add = (symbol) => ({ operation: "add", payload: item(symbol) });
const plain = (value) => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

test("watchlist overlapping edits operate on confirmed rows and pending stays true until the queue settles", async () => {
  let current = [item("AAPL")];
  const gate = deferred();
  let writes = 0;
  const repository = {
    read: async () => ({ items: current }),
    commit: async (command) => {
      if (++writes === 1) await gate.promise;
      current = applyWatchlistCommand(current, command);
      return { items: current };
    },
  };
  const store = createWatchlistStore(repository);
  await store.refresh();
  const first = store.execute(add("MSFT"));
  const second = store.execute({ operation: "target", payload: { symbol: "AAPL", targetPrice: 90, targetCurrency: "USD" } });
  const third = store.execute({ operation: "remove", payload: { symbol: "MSFT" } });
  assert.equal(store.getSnapshot().pending, true);
  assert.equal(store.getSnapshot().items.length, 1);
  gate.resolve();
  assert.deepEqual(await Promise.all([first, second, third]), [null, null, null]);
  assert.equal(store.getSnapshot().pending, false);
  assert.deepEqual(plain(store.getSnapshot().items), [{ ...item("AAPL"), targetPrice: 90, targetCurrency: "USD" }]);
});

test("failed account writes never publish unconfirmed data or fall back to local storage", async () => {
  const store = createWatchlistStore({ read: async () => ({ items: [item()] }), commit: async () => { throw new Error("저장 실패"); } });
  await store.refresh();
  assert.match(await store.execute(add("MSFT")), /저장 실패/);
  assert.deepEqual(plain(store.getSnapshot().items), [item()]);
  assert.equal(store.getSnapshot().pending, false);
});

test("an ambiguous write retry reuses its receipt while a late read cannot overwrite newer writes", async () => {
  const requestIds = [];
  const payloads = [];
  let current = [];
  const store = createWatchlistStore({
    read: async () => ({ items: current }),
    commit: async (command, requestId) => {
      requestIds.push(requestId);
      payloads.push(command);
      current = applyWatchlistCommand(current, command);
      if (requestIds.length === 1) throw new Error("connection lost after commit");
      return { items: current };
    },
  });
  await store.refresh();
  const command = add("AAPL");
  assert.ok(await store.execute(command));
  assert.equal(await store.execute({ ...command, payload: { ...command.payload, addedAt: "2026-09-12T00:00:30Z" } }), null);
  assert.equal(requestIds[0], requestIds[1]);
  assert.deepEqual(plain(payloads[0]), plain(payloads[1]));
  await Promise.all([store.refresh(), store.execute(add("MSFT"))]);
  assert.equal(store.getSnapshot().items.length, 2);
});

test("disposing an account aborts pending reads/writes and clears all old account records", async () => {
  const gate = deferred();
  let receivedSignal;
  const store = createWatchlistStore({
    read: async () => ({ items: [item("PRIVATE")] }),
    commit: async (_command, _requestId, signal) => { receivedSignal = signal; await gate.promise; return { items: [item("LATE")] }; },
  });
  await store.refresh();
  const pending = store.execute(add("OTHER"));
  await Promise.resolve();
  store.dispose();
  gate.resolve();
  assert.match(await pending, /계정이 변경/);
  assert.equal(receivedSignal.aborted, true);
  assert.equal(store.getSnapshot().items.length, 0);
  assert.equal(store.getSnapshot().ready, false);
});

test("shared refreshes deduplicate requests and a failed read can recover without fabricated empty success", async () => {
  let calls = 0;
  const store = createWatchlistStore({
    read: async () => { if (++calls === 1) throw new Error("조회 실패"); return { items: [item()] }; },
    commit: async () => { throw new Error("unexpected"); },
  });
  await Promise.all([store.refresh(), store.refresh()]);
  assert.equal(calls, 1);
  assert.equal(store.getSnapshot().ready, true);
  assert.match(store.getSnapshot().error, /조회 실패/);
  await store.refresh();
  assert.equal(store.getSnapshot().error, null);
  assert.equal(store.getSnapshot().items.length, 1);
});

function repositoryFixture({ userId = "user-a", raw, fail = false } = {}) {
  let activeAccount = userId;
  const values = new Map(raw === undefined ? [] : [["centifolio:watchlist:v1:" + userId, raw]]);
  const calls = [];
  let current = [];
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: activeAccount }, access_token: activeAccount + "-token" } }, error: null }) },
    rpc(name, args) {
      const call = { name, args, authorization: null, signal: null };
      const request = {
        abortSignal(signal) { call.signal = signal; return request; },
        setHeader(_name, value) { call.authorization = value; return request; },
        then(resolve, reject) {
          calls.push(call);
          if (fail) return Promise.resolve({ data: null, error: { code: "XX000", message: "private database detail" } }).then(resolve, reject);
          if (name === "commit_watchlist" && args.operation === "import") current = args.payload.map((entry) => ({ symbol: entry.symbol, name: entry.name, target_price: entry.targetPrice, target_currency: entry.targetCurrency, added_at: entry.addedAt }));
          return Promise.resolve({ data: current, error: null }).then(resolve, reject);
        },
      };
      return request;
    },
  };
  const exports = loadTypescript("src/features/watchlist/repository.ts", { "@/lib/supabase": { getSupabaseBrowserClient: () => client } });
  return { ...exports, values, calls, switchAccount: (next) => { activeAccount = next; }, repo: exports.accountWatchlistRepository(userId, { getItem: (key) => values.get(key) ?? null }) };
}

test("legacy import preserves exact original bytes, currency and dates, and imports matching content once", async () => {
  const expected = { ...item(), targetPrice: 120.25, targetCurrency: "USD" };
  const raw = JSON.stringify({ version: 1, items: [expected] });
  const fixture = repositoryFixture({ raw });
  const before = [...fixture.values];
  const first = await fixture.repo.read(AbortSignal.timeout(5000));
  await fixture.repo.read(AbortSignal.timeout(5000));
  assert.deepEqual(plain(first.items), [expected]);
  assert.deepEqual([...fixture.values], before);
  assert.equal(fixture.calls.filter((call) => call.name === "commit_watchlist").length, 1);
  assert.ok(fixture.calls.every((call) => call.authorization === "Bearer user-a-token"));
  const otherDevice = repositoryFixture({ raw });
  await otherDevice.repo.read(AbortSignal.timeout(5000));
  assert.equal(otherDevice.calls[0].args.request_id, fixture.calls[0].args.request_id);
});

test("account changes stop requests before SQL and never read another account's local legacy records", async () => {
  const fixture = repositoryFixture();
  fixture.values.set("centbloom:watchlist:v1:user-b", JSON.stringify({ version: 1, items: [item("SECRET")] }));
  assert.equal((await fixture.repo.read(AbortSignal.timeout(5000))).items.length, 0);
  assert.equal(fixture.calls.length, 1);
  fixture.switchAccount("user-b");
  await assert.rejects(fixture.repo.read(AbortSignal.timeout(5000)), /계정이 변경/);
  assert.equal(fixture.calls.length, 1);
});

test("corrupt legacy storage remains intact while account records are still readable", async () => {
  const fixture = repositoryFixture({ raw: "{corrupt" });
  const result = await fixture.repo.read(AbortSignal.timeout(5000));
  assert.match(result.warning, /기존 기록은 보존/);
  assert.equal(fixture.values.get("centifolio:watchlist:v1:user-a"), "{corrupt");
  assert.equal(fixture.calls.length, 1);
});

test("server failure is reported without raw private details and local validation rejects bad records", async () => {
  const fixture = repositoryFixture({ fail: true });
  await assert.rejects(fixture.repo.read(AbortSignal.timeout(5000)), (error) => /다시 시도/.test(error.message) && !error.message.includes("private database"));
  assert.throws(() => parseStoredWatchlist(JSON.stringify({ version: 1, items: [item(), item()] })), /읽을 수 없습니다/);
  assert.throws(() => applyWatchlistCommand([], { operation: "add", payload: { ...item(), targetPrice: Infinity, targetCurrency: "USD" } }));
  const fifty = Array.from({ length: 50 }, (_, index) => item("QA" + index));
  assert.throws(() => applyWatchlistCommand(fifty, add("EXTRA")), /최대 50/);
});

test("local fallback updates only its account key and preserves historical brand originals", async () => {
  const fixture = repositoryFixture();
  const raw = JSON.stringify({ version: 1, items: [item()] });
  fixture.values.set("stockfolio:watchlist:v1:guest", raw);
  const local = fixture.localWatchlistRepository({ getItem: (key) => fixture.values.get(key) ?? null, setItem: (key, value) => fixture.values.set(key, value) }, "centbloom:watchlist:v1:guest");
  const value = await local.commit(add("MSFT"), crypto.randomUUID(), AbortSignal.timeout(5000));
  assert.equal(value.items.length, 2);
  assert.equal(fixture.values.get("stockfolio:watchlist:v1:guest"), raw);
  assert.equal(fixture.calls.length, 0);
});
