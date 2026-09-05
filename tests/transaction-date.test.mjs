import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as currency from "../src/lib/currency.ts";

// Load the actual formatter with its existing extensionless TypeScript import.
const source = readFileSync(new URL("../src/lib/format.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
const exports = {};
runInNewContext(outputText, { exports, require: () => currency, Intl, Date });

test("default transaction day follows Korean midnight, including month and year boundaries", () => {
  assert.equal(exports.todayISO(new Date("2026-09-05T14:59:59Z")), "2026-09-05");
  assert.equal(exports.todayISO(new Date("2026-09-05T15:00:00Z")), "2026-09-06");
  assert.equal(exports.todayISO(new Date("2026-09-30T15:00:00Z")), "2026-10-01");
  assert.equal(exports.todayISO(new Date("2026-12-31T15:00:00Z")), "2027-01-01");
});
