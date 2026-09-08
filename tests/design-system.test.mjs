import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { audit, counts, inspectSource, newViolations, readTokens, tokenFile, validateDocument } from "./check-design.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const css = readFileSync(join(root, tokenFile), "utf8");
const doc = readFileSync(join(root, "DESIGN_SYSTEM.md"), "utf8");
const tokens = readTokens(css);
const inspect = (source, file = "src/example.tsx") => inspectSource(file, source, tokens);

test("semantic typography, colors, spacing, and neutral CSS pass", () => {
  assert.deepEqual(inspect('<p className="text-cf-body text-cf-ink font-sans rounded-cf-card p-4 sm:p-6">본문</p>'), []);
  assert.deepEqual(inspect(".x { color: var(--cf-color-ink); font-size: var(--cf-text-body); font-family: var(--cf-font-ui); padding: 0 var(--cf-space-4); border-radius: var(--cf-radius-card); }", "src/x.css"), []);
});
test("off-scale CSS, shorthand fonts, and locally redefined tokens fail", () => {
  const result = inspect(".x { font: 14px Georgia; font-size: 17px; color: hotpink; padding: 19px; border-radius: 17px; --cf-color-ink: #ff00ff; }", "src/x.css");
  for (const rule of ["font-shorthand", "text", "color", "space", "radius", "token-redefinition"]) assert.ok(result.some(f => f.rule === rule), rule);
});
test("responsive, hover, important and arbitrary Tailwind values cannot bypass checks", () => {
  assert.equal(inspect('<div className="sm:hover:text-[17px]! focus:bg-[red] bg-violet-500 text-[#ff00ff] font-serif rounded-3xl p-5 shadow-lg" />').length, 8);
});
test("unknown tokens and wrong token categories fail", () => {
  assert.ok(inspect('<p className="text-cf-made-up" />').some(f => f.rule === "unknown-token"));
  assert.ok(inspect(".x { color: var(--cf-color-missing); font-size: var(--cf-color-ink); }", "src/x.css").some(f => f.rule === "text"));
});
test("inline JS styles, SVG attributes, and dynamic utility prefixes are covered", () => {
  assert.ok(inspect('<div style={{ fontSize: 19, fontFamily: "Georgia", color: "red" }} />').length >= 3);
  assert.ok(inspect('<text fontSize={19} fill="red" />').length >= 2);
  assert.ok(inspect('const c = `text-${size}`;').some(f => f.rule === "dynamic-utility"));
});
test("CSS comments and ordinary content are not styles", () => {
  assert.deepEqual(inspect("/* font-size: 99px; color: red; */ .x { color: var(--cf-color-ink); }", "src/x.css"), []);
  assert.deepEqual(inspect('// color: "#ff00ff"\nconst title = "관심종목";'), []);
});
test("brand reuse, image dimensions/alt and color treatment are checked", () => {
  assert.deepEqual(inspect('<Image src={source} alt="" width={32} height={32} className="object-contain" />'), []);
  assert.ok(inspect('<Image src="/brand/other.png" />').some(f => f.rule === "brand-component"));
  assert.ok(inspect('<Image src={source} />').some(f => f.rule === "image-contract"));
  assert.ok(inspect('<img src="/x.png" />').some(f => f.rule === "image-component"));
  assert.ok(inspect('<Image src={source} alt="" fill className="sepia" />').some(f => f.rule === "image-treatment"));
});
test("baseline permits only existing fingerprints, not copies or new files", () => {
  const old = inspect('<p className="text-[17px]" />');
  const baseline = counts(old);
  assert.deepEqual(newViolations(old, baseline), []);
  assert.equal(newViolations([...old, ...old], baseline).length, 1);
  assert.equal(newViolations(inspect('<p className="text-[17px]" />', "src/new.tsx"), baseline).length, 1);
  assert.equal(newViolations(inspect('<p className="text-[19px]" />'), baseline).length, 1);
  assert.deepEqual(newViolations([], baseline), []);
});
test("a legacy CSS exception does not transfer to a new selector", () => {
  const baseline = counts(inspect(".old { font-size: 17px; }", "src/x.css"));
  assert.equal(newViolations(inspect(".new { font-size: 17px; }", "src/x.css"), baseline).length, 1);
});
test("real token documentation matches; drift, removed or duplicated tokens fail", () => {
  assert.deepEqual(validateDocument(css, doc), []);
  assert.ok(validateDocument(css.replace("--cf-text-body: 0.9375rem", "--cf-text-body: 1.1rem"), doc).length > 0);
  assert.ok(validateDocument(css.replace(/  --cf-text-body:[^\n]+\n/, ""), doc).length > 0);
  assert.throws(() => readTokens(css + "\n:root { --cf-text-body: 1rem; }"), /Duplicate/);
});
function fixture(t) {
  const base = realpathSync(tmpdir());
  const directory = mkdtempSync(join(base, "centbloom-design-"));
  t.after(() => {
    if (dirname(directory) !== base || !directory.startsWith(join(base, "centbloom-design-"))) throw new Error("Unsafe fixture cleanup");
    rmSync(directory, { recursive: true, force: true });
  });
  const write = (file, text) => {
    mkdirSync(dirname(join(directory, file)), { recursive: true });
    writeFileSync(join(directory, file), text);
  };
  write(tokenFile, css);
  write("DESIGN_SYSTEM.md", doc);
  write("src/app/globals.css", '@import "../styles/design-tokens.css";');
  write("tests/fixtures/design-baseline.json", JSON.stringify({ version: 1, entries: {} }));
  write("tests/fixtures/design-exceptions.json", "[]");
  return { directory, write };
}
test("actual command fails on new violations and labels legacy debt without claiming compliance", (t) => {
  const { directory, write } = fixture(t);
  const command = (...args) => spawnSync(process.execPath, [join(root, "tests/check-design.mjs"), ...args], { cwd: directory, encoding: "utf8" });
  assert.equal(command().status, 0);
  write("src/New.tsx", '<p className="text-[17px]" />');
  assert.equal(command().status, 1);
  write("tests/fixtures/design-baseline.json", JSON.stringify({ version: 1, entries: audit(directory).current }));
  const result = command("--json");
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).fullyCompliant, false);
  assert.equal(command("--strict").status, 1);
});
test("official logo exceptions allow exactly one occurrence and require a reason", (t) => {
  const { directory, write } = fixture(t);
  const exception = { file: "src/Logo.tsx", rule: "color", value: "#4285F4", count: 1, reason: "Official logo" };
  write("tests/fixtures/design-exceptions.json", JSON.stringify([exception]));
  write("src/Logo.tsx", '<path fill="#4285F4" />');
  assert.equal(audit(directory).findings.length, 0);
  write("src/Logo.tsx", '<g><path fill="#4285F4" /><path fill="#4285F4" /></g>');
  assert.equal(audit(directory).findings.length, 1);
  write("tests/fixtures/design-exceptions.json", JSON.stringify([{ ...exception, reason: "" }]));
  assert.ok(audit(directory).errors.length > 0);
  write("tests/fixtures/design-exceptions.json", JSON.stringify([exception]));
  write("src/Logo.tsx", "<g />");
  assert.ok(audit(directory).errors.some(error => error.includes("Stale")));
});
test("broken token import and token references fail the real audit", (t) => {
  const { directory, write } = fixture(t);
  write("src/app/globals.css", "");
  assert.ok(audit(directory).errors.some(error => error.includes("import")));
  write("src/app/globals.css", '@import "../styles/design-tokens.css";');
  write(tokenFile, css.replace("var(--cf-color-ink)", "var(--cf-color-missing)"));
  assert.ok(audit(directory).errors.some(error => error.includes("references missing")));
});

test("resolved baseline entries must be removed; debt cannot silently return", (t) => {
  const { directory, write } = fixture(t);
  write("src/New.tsx", '<p className="text-[17px]" />');
  write("tests/fixtures/design-baseline.json", JSON.stringify({ version: 1, entries: audit(directory).current }));
  write("src/New.tsx", '<p className="text-cf-body" />');
  assert.ok(audit(directory).errors.some(error => error.includes("resolved baseline")));
});
test("token file cannot hide ordinary CSS and logo exceptions cannot be duplicated", (t) => {
  const { directory, write } = fixture(t);
  write(tokenFile, css + "\n:root { background: hotpink; }\n@theme inline { --color-custom: red; }");
  assert.ok(audit(directory).errors.some(error => error.includes("custom properties")));
  assert.ok(audit(directory).errors.some(error => error.includes("only map")));
  write(tokenFile, css);
  const exception = { file: "src/Logo.tsx", rule: "color", value: "#4285F4", count: 1, reason: "Official logo" };
  write("src/Logo.tsx", '<g><path fill="#4285F4" /><path fill="#4285F4" /></g>');
  write("tests/fixtures/design-exceptions.json", JSON.stringify([exception, exception]));
  assert.ok(audit(directory).errors.some(error => error.includes("Duplicate design exception")));
});
test("real Tailwind compilation emits the documented semantic utilities", async () => {
  const { compile } = await import("@tailwindcss/node");
  const compiler = await compile(readFileSync(join(root, "src/app/globals.css"), "utf8"), { base: join(root, "src/app"), onDependency() {} });
  const output = compiler.build(["text-cf-body", "text-cf-title", "bg-cf-surface", "rounded-cf-card", "font-sans"]);
  for (const declaration of ["font-size: var(--cf-text-body)", "font-size: var(--cf-text-title)", "background-color: var(--cf-color-surface)", "border-radius: var(--cf-radius-card)", "font-family: var(--cf-font-ui)"]) {
    assert.ok(output.includes(declaration), declaration);
  }
});

test("Tailwind apply in CSS follows the same rules as JSX", () => {
  assert.equal(inspect(".x { @apply text-[17px] bg-red-500; }", "src/x.css").length, 2);
  assert.deepEqual(inspect(".x { @apply text-cf-body bg-cf-surface p-4; }", "src/x.css"), []);
});
