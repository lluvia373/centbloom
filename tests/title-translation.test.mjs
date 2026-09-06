import test from "node:test";
import assert from "node:assert/strict";
import { loadTypescript } from "./load-typescript.mjs";
const { createTitleTranslator, translatedTitle } = loadTypescript("src/features/market/server/title-translation.ts");
const ok = (response) => ({ choices: [{ finish_reason: "stop", message: { content: response } }] });
const story = (title, id = title) => ({ title, id, publisher: "Source", url: "https://example.com/news", symbols: ["TEST"], publishedAt: "2026-09-06T00:00:00Z" });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("reject changed figures, missing Korean, injected markup and truncated output", () => {
  assert.equal(translatedTitle("Shares gain 3% in 2026", ok("주가 2026년 3% 상승")), "주가 2026년 3% 상승");
  for (const response of [ok("주가 4% 상승"), ok("Shares gain 3% in 2026"), ok("<b>주가 3% 상승 2026</b>"), { response: "주가 3% 상승 2026", choices: [{ finish_reason: "length" }] }]) {
    assert.throws(() => translatedTitle("Shares gain 3% in 2026", response));
  }
});

test("translation cannot invent a market direction in a neutral headline", () => {
  assert.throws(() => translatedTitle("Dow Jones Futures Loom After Attacks", ok("공격 이후 다우존스 선물 급등 전망")));
  assert.throws(() => translatedTitle("Market News", ok("시장 급락 소식")));
});

test("calendar date localization preserves month and day without accepting changed dates", () => {
  assert.equal(translatedTitle("Micron may rise after Sept. 30", ok("마이크론 9월 30일 이후 상승 가능")), "마이크론 9월 30일 이후 상승 가능");
  assert.throws(() => translatedTitle("Micron may rise after Sept. 30", ok("마이크론 10월 30일 이후 상승 가능")));
});

test("identical headlines share work across consumers, cache successes and invalidate changed titles", async () => {
  let calls = 0;
  const translate = createTitleTranslator(async (title) => { calls++; await delay(5); return ok(title.includes("2") ? "주가 2% 상승" : "주가 1% 상승"); });
  const a = story("Shares gain 1%");
  const [first, second] = await Promise.all([translate([a]), translate([{ ...a, id: "different" }])]);
  assert.equal(calls, 1);
  assert.equal(first[0].titleKo, "주가 1% 상승");
  assert.equal(second[0].id, "different");
  assert.equal(first[0].title, a.title);
  assert.equal(a.titleKo, undefined);
  await translate([a]);
  assert.equal(calls, 1);
  await translate([{ ...a, title: "Shares gain 2%" }]);
  assert.equal(calls, 2);
});

test("failure keeps original, cooldown prevents polling storms and later retry can recover", async () => {
  let now = 0, calls = 0;
  const translate = createTitleTranslator(async () => { if (++calls === 1) throw Error("offline"); return ok("주가 상승"); }, { now: () => now });
  const a = story("Shares rise");
  assert.equal((await translate([a]))[0].titleKo, undefined);
  await translate([a]);
  assert.equal(calls, 1);
  now = 300001;
  assert.equal((await translate([a]))[0].titleKo, "주가 상승");
});

test("one consumer abort does not cancel a shared translation still in use", async () => {
  let calls = 0;
  const translate = createTitleTranslator(async (_, signal) => { calls++; await delay(20); signal.throwIfAborted(); return ok("주가 상승"); });
  const controller = new AbortController();
  const aborted = translate([story("Shares rise")], controller.signal);
  const rejected = assert.rejects(aborted, { name: "AbortError" });
  const active = translate([story("Shares rise")]);
  controller.abort();
  await rejected;
  assert.equal((await active)[0].titleKo, "주가 상승");
  assert.equal(calls, 1);
});

test("bounded parallelism and mixed failure do not remove or reorder news", async () => {
  let running = 0, peak = 0;
  const translate = createTitleTranslator(async (title) => {
    running++; peak = Math.max(peak, running);
    await delay(5); running--;
    if (title.includes("5")) throw Error("failed");
    return ok("주가 " + title.match(/\d+/)[0] + "% 상승");
  });
  const input = Array.from({ length: 12 }, (_, i) => story("Shares gain " + i + "%"));
  const output = await translate(input);
  assert.equal(peak, 4);
  assert.equal(output.length, input.length);
  output.forEach((item, i) => { assert.equal(item.id, input[i].id); assert.equal(Boolean(item.titleKo), i !== 5); });
});

test("deadline returns original and ignores late translation; Korean titles skip inference", async () => {
  let calls = 0;
  const translate = createTitleTranslator(async () => { calls++; await delay(40); return ok("주가 상승"); }, { timeoutMs: 10 });
  const input = [story("Shares rise"), story("이미 한국어 제목")];
  const output = await translate(input);
  assert.equal(output[0].titleKo, undefined);
  assert.equal(calls, 1);
  await delay(50);
  assert.equal(output[0].titleKo, undefined);
});
