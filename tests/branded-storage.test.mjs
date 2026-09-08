import assert from "node:assert/strict";
import test from "node:test";
import { readBrandedStorage, isBrandedStorageKey, removeBrandedStorage } from "../src/lib/branded-storage.ts";

test("both prior brands remain readable with account isolation and current values take precedence", () => {
  for (const oldBrand of ["centifolio", "stockfolio"]) {
    for (const suffix of ["-journal:v1:user-a", ":watchlist:v1:user-a", "-performance-v2:user-a", ":recent-searches:v1:user-a"]) {
      const key = "centbloom" + suffix, oldKey = oldBrand + suffix;
      const values = new Map([[oldKey, "original bytes"]]);
      const storage = { getItem: k => values.get(k) ?? null };
      assert.equal(readBrandedStorage(storage, key), "original bytes");
      assert.equal(readBrandedStorage(storage, key.replace("user-a", "user-b")), null);
      assert.deepEqual([...values], [[oldKey, "original bytes"]]);
      for (const current of ["[]", ""]) {
        values.set(key, current);
        assert.equal(readBrandedStorage(storage, key), current);
      }
      assert.equal(isBrandedStorageKey(oldKey, key), true);
      assert.equal(isBrandedStorageKey(oldKey.replace("user-a", "user-b"), key), false);
    }
  }
});

test("Centifolio takes precedence over older Stockfolio data and malformed content is preserved", () => {
  const values = new Map([["centifolio-journal:v1:local", "{broken"], ["stockfolio-journal:v1:local", "[]"]]);
  assert.equal(readBrandedStorage({getItem: k => values.get(k) ?? null}, "centbloom-journal:v1:local"), "{broken");
  assert.throws(() => readBrandedStorage({getItem() {throw new Error("denied");}}, "centbloom-view:guest"), /denied/);
  assert.equal(isBrandedStorageKey(null, "centbloom-view:guest"), true);
});

test("clearing a completed outbox retains recovery copies and other users", () => {
  const values = new Map([
    ["centbloom-pending-transaction:a", "new"], ["centifolio-pending-transaction:a", "old"],
    ["centifolio-pending-transaction:a:recovery:1", "recovery"], ["centifolio-pending-transaction:b", "other account"],
  ]);
  removeBrandedStorage({removeItem: k => values.delete(k)}, "centbloom-pending-transaction:a");
  assert.deepEqual([...values], [["centifolio-pending-transaction:a:recovery:1", "recovery"], ["centifolio-pending-transaction:b", "other account"]]);
});
