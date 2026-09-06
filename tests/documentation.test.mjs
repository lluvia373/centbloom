import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const checker = fileURLToPath(new URL("./check-docs.mjs", import.meta.url));
function fixture(t) {
  const base = realpathSync(tmpdir());
  const root = mkdtempSync(join(base, "centifolio-docs-"));
  t.after(() => {
    if (dirname(root) !== base || !root.startsWith(join(base, "centifolio-docs-"))) {
      throw new Error("Refusing to remove a path outside the test fixture directory");
    }
    rmSync(root, { recursive: true, force: true });
  });
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  writeFileSync(join(root, ".gitignore"), "/BUSINESS_MODEL.md\n/work/\n");
  writeFileSync(join(root, "AGENTS.md"), [
    "## 문서 관리 기준", "", "| 내용 | 기준 파일 |", "| --- | --- |",
    "| 규칙 | 이 AGENTS.md |", "| 안내 | [README.md](./README.md) |",
    "| 비공개 | 로컬 전용 BUSINESS_MODEL.md |", "",
  ].join("\n"));
  writeFileSync(join(root, "README.md"), [
    "## 문서 안내", "", "| 내용 | 파일 |", "| --- | --- |",
    "| 규칙 | [AGENTS.md](./AGENTS.md) |", "", "## 검증 — 기준", "",
    "[확인](#검증--기준)", "", "~~~md", "[예시](./not-a-real-file.md)", "~~~", "",
  ].join("\n"));
  return root;
}
function run(root) {
  const result = spawnSync(process.execPath, [checker, root], { encoding: "utf8" });
  assert.ifError(result.error);
  return { code: result.status, output: result.stdout + result.stderr };
}
function append(root, file, text) {
  const path = join(root, file);
  writeFileSync(path, readFileSync(path, "utf8") + text);
}

test("valid checkout works without the private plan and ignores generated examples", (t) => {
  const root = fixture(t);
  mkdirSync(join(root, "work"));
  writeFileSync(join(root, "work", "DRAFT.md"), "[ignored](./missing)\n");
  assert.equal(run(root).code, 0);
});

test("a new nested document mentioned outside the registry still fails", (t) => {
  const root = fixture(t);
  mkdirSync(join(root, "docs"));
  writeFileSync(join(root, "docs", "NEW_PLAN.md"), "# Plan\n");
  append(root, "AGENTS.md", "\n## Other\nRemember docs/NEW_PLAN.md\n");
  const result = run(root);
  assert.equal(result.code, 1);
  assert.match(result.output, /docs\/NEW_PLAN.md: missing from AGENTS registry/);
});

test("registering in only AGENTS fails until README is also updated", (t) => {
  const root = fixture(t);
  writeFileSync(join(root, "SEO_PLAN.md"), "# Search\n");
  append(root, "AGENTS.md", "| 검색 | [SEO_PLAN.md](./SEO_PLAN.md) |\n");
  assert.match(run(root).output, /SEO_PLAN.md: missing from README registry/);
  const path = join(root, "README.md");
  writeFileSync(path, readFileSync(path, "utf8").replace("## 검증", "| 검색 | [SEO_PLAN.md](./SEO_PLAN.md) |\n\n## 검증"));
  assert.equal(run(root).code, 0);
});

test("broken paths and renamed headings fail", (t) => {
  const root = fixture(t);
  append(root, "README.md", "\n[경로](./missing.mjs)\n[제목](#없는-제목)\n");
  const result = run(root);
  assert.equal(result.code, 1);
  assert.match(result.output, /broken link \.\/missing.mjs/);
  assert.match(result.output, /missing anchor #없는-제목/);
});

test("private plan may exist locally but must not be tracked", (t) => {
  const root = fixture(t);
  writeFileSync(join(root, "BUSINESS_MODEL.md"), "# Local business plan\n");
  assert.equal(run(root).code, 0);
  execFileSync("git", ["add", "-f", "BUSINESS_MODEL.md"], { cwd: root });
  const result = run(root);
  assert.equal(result.code, 1);
  assert.match(result.output, /private document is tracked by Git/);
});
