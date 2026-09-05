import assert from "node:assert/strict";
import test from "node:test";
import { legacyStorageKey, readBrandedStorage } from "../src/lib/branded-storage.ts";

test("existing account-scoped data remains readable without modifying old storage", () => {
  for (const key of ["centifolio-journal:v1:user-a", "centifolio:watchlist:v1:user-a", "centifolio-view:guest", "centifolio-performance-snapshots:user-a"]) {
    const oldKey = legacyStorageKey(key);
    const values = new Map([[oldKey, "original bytes"]]);
    const storage = { getItem: (k) => values.get(k) ?? null };
    assert.equal(readBrandedStorage(storage, key), "original bytes");
    assert.equal(readBrandedStorage(storage, key.replace("user-a", "user-b")), key.includes("user-a") ? null : "original bytes");
    assert.deepEqual([...values], [[oldKey, "original bytes"]]);
    values.set(key, "[]");
    assert.equal(readBrandedStorage(storage, key), "[]");
    values.set(key, "");
    assert.equal(readBrandedStorage(storage, key), "");
  }
});

test("malformed content and storage errors reach the existing validation path", () => {
  assert.equal(readBrandedStorage({ getItem: () => "{broken" }, "centifolio-journal:v1:local"), "{broken");
  assert.throws(() => readBrandedStorage({ getItem() { throw new Error("denied"); } }, "centifolio-view:guest"), /denied/);
});
