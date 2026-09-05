import assert from "node:assert/strict";
import test from "node:test";
import { discoveryStocks, marketForSymbol, marketSearchSymbols, matchingStocks, knownMarketDelay } from "../src/lib/markets.ts";
import { toKRW } from "../src/lib/currency.ts";

test("exchange suffix wins over a company's home country; other markets remain distinct", () => {
  for (const [symbol, market] of [["005930.KS", "kr"], ["247540.KQ", "kr"], ["TM", "us"], ["7203.T", "jp"], ["0700.HK", "hk"], ["600519.SS", "cn"], ["000001.SZ", "cn"], ["SAP.DE", "other"]]) {
    assert.equal(marketForSymbol(symbol), market);
  }
});

test("numeric stock codes resolve in the selected exchange, preserving leading zeros", () => {
  assert.deepEqual(marketSearchSymbols("7203", "jp"), ["7203.T"]);
  assert.deepEqual(marketSearchSymbols("130a", "jp"), ["130A.T"]);
  assert.deepEqual(marketSearchSymbols("700", "hk"), ["0700.HK"]);
  assert.deepEqual(marketSearchSymbols("09988", "hk"), ["9988.HK"]);
  assert.deepEqual(marketSearchSymbols("000001", "cn"), ["000001.SZ"]);
  assert.deepEqual(marketSearchSymbols("600519", "cn"), ["600519.SS"]);
  assert.deepEqual(marketSearchSymbols("005930", "kr"), ["005930.KS", "005930.KQ"]);
  assert.deepEqual(marketSearchSymbols("000001", "all"), ["000001"]);
});

test("local-language aliases respect the selected listing market and never contain prices", () => {
  assert.equal(matchingStocks("도요타", "jp")[0]?.symbol, "7203.T");
  assert.equal(matchingStocks("任天堂", "jp")[0]?.symbol, "7974.T");
  assert.equal(matchingStocks("腾讯", "hk")[0]?.symbol, "0700.HK");
  assert.equal(matchingStocks("마오타이", "cn")[0]?.symbol, "600519.SS");
  assert.deepEqual(matchingStocks("텐센트", "cn"), []);
  assert.ok(discoveryStocks("all").every((stock) => !("price" in stock)));
});

test("delayed exchanges cannot be labeled tick realtime, and Asian FX amounts retain units", () => {
  assert.equal(knownMarketDelay("7203.T"), 20);
  assert.equal(knownMarketDelay("0700.HK"), 15);
  assert.equal(knownMarketDelay("600519.SS"), 30);
  assert.equal(knownMarketDelay("000001.SZ"), 30);
  assert.equal(toKRW(3000, "JPY", 9), 27000);
  assert.equal(toKRW(400, "HKD", 175), 70000);
  assert.equal(toKRW(100, "CNY", 190), 19000);
  assert.equal(toKRW(200, "GBp", 1800), 3600);
});
