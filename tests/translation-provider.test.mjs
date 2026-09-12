import test from "node:test";
import assert from "node:assert/strict";
import { loadTypescript } from "./load-typescript.mjs";
const file = "src/features/market/server/translation-provider.ts";
const ok = content => ({ choices: [{ finish_reason: "stop", message: { content } }] });
const story = title => ({ title, id: title, publisher: "Source", url: "https://example.com", symbols: ["TEST"], publishedAt: "2026-09-12T00:00:00Z" });
function memory() {
  const values = new Map(), writes = [];
  return { values, writes, get: async (key, type) => {
    const value = values.get(key) ?? null;
    return value && type === "json" ? JSON.parse(value) : value;
  }, put: async (key, value, options) => { values.set(key, value); writes.push({ key, options }); } };
}
test("separate feeds reuse the same translator and share one successful inference", async () => {
  const kv = memory(); let calls = 0;
  const ai = { run: async () => { calls++; return ok("주가 1% 상승"); } };
  const { createNewsTitleTranslator: make } = loadTypescript(file);
  const a = make(ai, kv), b = make(ai, kv);
  assert.equal(a, b);
  const out = await Promise.all([a([story("Shares gain 1%")]), b([story("Shares gain 1%")])]);
  assert.equal(calls, 1); assert.equal(out[1][0].titleKo, "주가 1% 상승");
  const cached = kv.writes.find(row => row.key.startsWith("news-title:v6:"));
  assert.equal(cached.options.expirationTtl, 7 * 86400);
  // A fresh worker reuses persistent successful output.
  await loadTypescript(file).createNewsTitleTranslator(ai, kv)([story("Shares gain 1%")]);
  assert.equal(calls, 1);
});
test("failed attempts survive worker restart, wait before retry and stop at four per day", async () => {
  const kv = memory(); let calls = 0, success = false;
  const ai = { run: async () => { calls++; if (!success) throw Error("offline"); return ok("주가 상승"); } };
  const invoke = () => loadTypescript(file).createNewsTitleTranslator(ai, kv)([story("Shares rise")]);
  assert.equal((await invoke())[0].titleKo, undefined);
  await invoke(); assert.equal(calls, 1);
  const key = [...kv.values.keys()].find(key => key.startsWith("news-title-retry:"));
  const first = JSON.parse(kv.values.get(key));
  for (let i = 2; i <= 4; i++) {
    const state = JSON.parse(kv.values.get(key)); state.nextAttemptAt = 0;
    kv.values.set(key, JSON.stringify(state)); await invoke();
  }
  assert.equal(calls, 4); await invoke(); assert.equal(calls, 4);
  assert.equal(JSON.parse(kv.values.get(key)).expiresAt, first.expiresAt);
  success = true;
  kv.values.set(key, JSON.stringify({ ...first, expiresAt: Date.now() - 1 }));
  assert.equal((await invoke())[0].titleKo, "주가 상승");
  assert.equal(calls, 5);
});
test("cached news can be read while all actual inference slots are occupied", async () => {
  const kv = memory(); let release, started = 0;
  const blocked = new Promise(resolve => { release = resolve; });
  const ai = { run: async (_model, input) => {
    started++; await blocked;
    const title = JSON.parse(input.messages[1].content).headline;
    return ok("주가 " + title.match(/\d+/)[0] + "% 상승");
  } };
  const { createNewsTitleTranslator: make } = loadTypescript(file);
  const translate = make(ai, kv);
  const waiting = translate(Array.from({ length: 4 }, (_, i) => story("Shares gain " + i + "%")));
  try {
    const end = Date.now() + 1000;
    while (started < 4 && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 1));
    assert.equal(started, 4);
    const title = "Shares gain 9%";
    const hash = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(title))).toString("hex");
    kv.values.set("news-title:v5:@cf/openai/gpt-oss-120b:" + hash, "주가 9% 상승");
    const cached = await translate([story(title)], undefined, 100);
    assert.equal(cached[0].titleKo, "주가 9% 상승");
    assert.equal(started, 4);
  } finally { release(); await waiting; }
});
test("an invalid unit conversion is not cached as successful", async () => {
  const kv = memory();
  const translate = loadTypescript(file).createNewsTitleTranslator({ run: async () => ok("매출 7억 원") }, kv);
  assert.equal((await translate([story("Revenue is $700M")]))[0].titleKo, undefined);
  assert.equal([...kv.values.keys()].filter(key => key.startsWith("news-title:v6:")).length, 0);
});

test("quota exhaustion stops new inference across headlines and worker restarts", async () => {
 const kv=memory();let calls=0;
 const ai={run:async()=>{calls++;throw Error("4006: daily free allocation exhausted");}};
 const translate=loadTypescript(file).createNewsTitleTranslator(ai,kv);
 await translate([story("Shares rise")]);
 await translate([story("Shares gain 2%")]);
 await loadTypescript(file).createNewsTitleTranslator(ai,kv)([story("Shares gain 3%")]);
 assert.equal(calls,1);
 assert.equal(kv.writes.find(x=>x.key==="news-translation-provider-cooldown:v1").options.expirationTtl,3600);
});
