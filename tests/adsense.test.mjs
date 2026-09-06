import test from "node:test";
import assert from "node:assert/strict";
import { loadTypescript } from "./load-typescript.mjs";
const { readAdSenseConfig, requestAdOnce } = loadTypescript("src/features/ads/adsense.ts");

test("ads stay off until explicitly enabled with complete publisher and slot IDs", () => {
  const client = "ca-pub-1234567890123456";
  assert.equal(readAdSenseConfig(undefined, client, "1234567890"), null);
  assert.equal(readAdSenseConfig("false", client, "1234567890"), null);
  assert.equal(readAdSenseConfig("true", undefined, "1234567890"), null);
  assert.equal(readAdSenseConfig("true", client, ""), null);
  assert.equal(readAdSenseConfig("true", client + "&other=1", "123"), null);
  assert.equal(readAdSenseConfig("true", client, "bad-slot"), null);
  assert.equal(readAdSenseConfig("true", client, "1234567890").client, client);
});

test("duplicate callbacks and live data rerenders cannot request the same ad twice", () => {
  const element = { isConnected: true, getBoundingClientRect: () => ({ width: 390 }), getAttribute: () => null };
  const requests = [];
  const queue = { push: value => requests.push(value) };
  assert.equal(requestAdOnce(element, queue), "requested");
  assert.equal(requestAdOnce(element, queue), "requested");
  assert.equal(requests.length, 1);
  assert.equal(Object.keys(requests[0]).length, 0);
});

test("wait for a mounted visible width, then request; respect a vendor initialized element", () => {
  let width = 0, status = null, count = 0;
  const element = { isConnected: false, getBoundingClientRect: () => ({ width }), getAttribute: () => status };
  const queue = { push: () => count++ };
  assert.equal(requestAdOnce(element, queue), "waiting");
  element.isConnected = true;
  assert.equal(requestAdOnce(element, queue), "waiting");
  width = 390;
  assert.equal(requestAdOnce(element, queue), "requested");
  status = "done";
  assert.equal(requestAdOnce({ ...element }, queue), "requested");
  assert.equal(count, 1);
});

test("vendor failure is contained and not retried by resize callbacks", () => {
  const element = { isConnected: true, getBoundingClientRect: () => ({ width: 390 }), getAttribute: () => null };
  let calls = 0;
  const queue = { push: () => { calls++; throw new Error("blocked vendor"); } };
  assert.equal(requestAdOnce(element, queue), "failed");
  requestAdOnce(element, queue);
  assert.equal(calls, 1);
});
