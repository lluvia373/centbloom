import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const ACCOUNT_A = "00000000-0000-4000-8000-000000000001";
const ACCOUNT_B = "00000000-0000-4000-8000-000000000002";
const item = (symbol = "AAPL") => ({ symbol, name: symbol, targetPrice: null, targetCurrency: null, addedAt: "2026-09-12T00:00:00Z" });

test("watchlist RPCs isolate accounts, preserve tombstones across device imports and protect retries and target updates", async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid$$; grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;");
    await db.query("insert into auth.users(id) values($1),($2)", [ACCOUNT_A, ACCOUNT_B]);
    await db.exec(readFileSync("supabase/migrations/20260912112710_account_watchlists.sql", "utf8"));
    const account = async (id) => { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); await db.exec("set role authenticated"); };
    const commit = async (operation, payload, requestId = crypto.randomUUID()) => (await db.query("select public.commit_watchlist($1::uuid,$2::text,$3::jsonb) as items", [requestId, operation, JSON.stringify(payload)])).rows[0].items;
    const read = async () => (await db.query("select public.read_watchlist() as items")).rows[0].items;
    await account(ACCOUNT_A);
    const imported = { ...item("AAPL"), targetPrice: 100.5, targetCurrency: "USD" };
    const importId = crypto.randomUUID();
    await commit("import", [imported, item("MSFT")], importId);
    assert.equal((await read())[0].target_price, 100.5);
    await commit("target", { symbol: "AAPL", targetPrice: 90, targetCurrency: "USD" });
    await commit("add", item("AAPL")); // Duplicate add must not erase the target.
    assert.equal((await read())[0].target_price, 90);
    await commit("remove", { symbol: "AAPL" });
    await commit("import", [imported, item("MSFT")]); // Another device and receipt.
    await commit("import", [imported, item("MSFT")], importId); // Same initial import retry.
    assert.deepEqual((await read()).map((row) => row.symbol), ["MSFT"]);
    await assert.rejects(commit("target", { symbol: "AAPL", targetPrice: 99, targetCurrency: "USD" }), /watchlist_missing/);
    await commit("remove", { symbol: "NEVER_IMPORTED" });
    await commit("import", [item("NEVER_IMPORTED")]);
    assert.equal((await read()).length, 1);
    const addId = crypto.randomUUID();
    await commit("add", item("AAPL"), addId); // An explicit user add may restore a deletion.
    await commit("remove", { symbol: "AAPL" });
    await commit("add", item("AAPL"), addId); // Lost-response retry cannot restore it again.
    assert.deepEqual((await read()).map((row) => row.symbol), ["MSFT"]);
    await assert.rejects(commit("add", item("CHANGED"), addId), /Request ID reused/);
    assert.equal((await db.query("select count(*)::int n from public.watchlist_items where deleted_at is not null")).rows[0].n, 2);
    await assert.rejects(db.exec("delete from public.watchlist_items"), /permission denied/);

    await account(ACCOUNT_B);
    assert.deepEqual(await read(), []);
    assert.equal((await db.query("select count(*)::int n from public.watchlist_write_receipts")).rows[0].n, 0);
    await assert.rejects(db.query("insert into public.watchlist_items(user_id,symbol,name) values($1,'LEAK','LEAK')", [ACCOUNT_A]), /Account mismatch|row-level security/);
    await commit("add", item("AAPL"));
    await assert.rejects(db.query("update public.watchlist_items set user_id=$1", [ACCOUNT_A]), /permission denied/);
    await assert.rejects(commit("target", { symbol: "AAPL", targetPrice: -1, targetCurrency: "USD" }));
    await assert.rejects(commit("target", { symbol: "AAPL", targetPrice: 99, targetCurrency: null }));
    await assert.rejects(commit("target", { symbol: "AAPL", targetPrice: "NaN", targetCurrency: "USD" }));
    assert.equal((await read())[0].target_price, null);

    for (let index = 0; index < 49; index++) await commit("add", item("QA" + index));
    assert.equal((await read()).length, 50);
    await assert.rejects(commit("add", item("OVER")), /watchlist_limit/);
    await assert.rejects(db.query("insert into public.watchlist_items(user_id,symbol,name) values($1,'DIRECT','DIRECT')", [ACCOUNT_B]), /watchlist_limit/);
    // Existing rows in a full list remain idempotent; an oversized import is atomic.
    await commit("import", [item("AAPL")]);
    await assert.rejects(commit("import", [item("NEW1"), item("NEW2")]), /watchlist_limit/);
    assert.equal((await read()).length, 50);
    await commit("remove", { symbol: "QA0" });
    await commit("add", item("NEXT"));
    assert.equal((await read()).length, 50);

    await db.exec("reset role; set role anon");
    await assert.rejects(db.query("select public.read_watchlist()"), /permission denied/);
    await assert.rejects(db.query("select * from public.watchlist_items"), /permission denied/);
    await assert.rejects(commit("add", item("ANON")), /permission denied/);
  } finally { await db.close(); }
});
