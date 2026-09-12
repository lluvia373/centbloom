import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const checker = fileURLToPath(new URL("./check-docs.mjs", import.meta.url));
function fixture(t) {
  const base = realpathSync(tmpdir());
  const root = mkdtempSync(join(base, "centbloom-docs-"));
  t.after(() => {
    if (dirname(root) !== base || !root.startsWith(join(base, "centbloom-docs-"))) {
      throw new Error("Refusing to remove a path outside the test fixture directory");
    }
    rmSync(root, { recursive: true, force: true });
  });
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  writeFileSync(join(root, ".gitignore"), "/BUSINESS_MODEL.md\n/work/\n");
  writeFileSync(join(root, "AGENTS.md"), [
    "## 문서 관리 기준", "", "| 내용 | 기준 파일 |", "| --- | --- |",
    "| 규칙 | 이 AGENTS.md |", "| 안내 | [README.md](./README.md) |",
    "| 결정 | [DECISIONS.md](./DECISIONS.md) |",
    "| 비공개 | 로컬 전용 BUSINESS_MODEL.md |", "",
  ].join("\n"));
  writeFileSync(join(root, "README.md"), [
    "## 문서 안내", "", "| 내용 | 파일 |", "| --- | --- |",
    "| 규칙 | [AGENTS.md](./AGENTS.md) |", "| 결정 | [DECISIONS.md](./DECISIONS.md) |", "", "## 검증 — 기준", "",
    "[확인](#검증--기준)", "", "~~~md", "[예시](./not-a-real-file.md)", "~~~", "",
  ].join("\n"));
  writeFileSync(join(root, "DECISIONS.md"), "# Decisions\n\nD005: no member discussions in the first release.\n");
  return root;
}
function reviewPlan(root) {
  const decision = readFileSync(join(root, "DECISIONS.md"), "utf8").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const hash = createHash("sha256").update(decision).digest("hex");
  writeFileSync(join(root, "BUSINESS_MODEL.md"), "# Local business plan\n<!-- business-model-decisions-sha256: " + hash + " -->\n");
}
function run(root, ...args) {
  const result = spawnSync(process.execPath, [checker, root, ...args], { encoding: "utf8" });
  assert.ifError(result.error);
  return { code: result.status, output: result.stdout + result.stderr };
}
function append(root, file, text) {
  const path = join(root, file);
  writeFileSync(path, readFileSync(path, "utf8") + text);
}

function replace(root, file, before, after) {
  const path = join(root, file);
  const source = readFileSync(path, "utf8");
  assert.ok(source.includes(before), "Fixture text should contain the replacement target");
  writeFileSync(path, source.replace(before, after));
}

const featureRow = "| 관심종목 | [저장 의미](./PRODUCT_SPEC.md#관심종목) | [목록 디자인](./DESIGN_SYSTEM.md#목록) | [기능](./src/features/watchlist), [화면](./src/app/watchlist/page.tsx), [API](./src/app/api/watchlist/route.ts) | [저장 회귀](./tests/watchlist.test.mjs) |";

function featureFixture(t) {
  const root = fixture(t);
  for (const file of ["DEVELOPMENT.md", "PRODUCT_SPEC.md", "DESIGN_SYSTEM.md"]) {
    append(root, "AGENTS.md", "| 담당 | [" + file + "](./" + file + ") |\n");
    replace(root, "README.md", "## 검증", "| 담당 | [" + file + "](./" + file + ") |\n\n## 검증");
  }
  writeFileSync(join(root, "PRODUCT_SPEC.md"), "# 기능\n\n## 관심종목\n저장과 조회.\n");
  writeFileSync(join(root, "DESIGN_SYSTEM.md"), "# 디자인\n\n## 목록\n목록의 화면 기준.\n");
  writeFileSync(join(root, "DEVELOPMENT.md"), [
    "# 개발", "", "## 작업별 시작점", "",
    "| 기능 | 기능 명세 | 디자인 기준 | 구현·확장 시작점 | 검증 |",
    "| --- | --- | --- | --- | --- |", featureRow, "",
    "## 기타", "", "```md", "## 작업별 시작점", "| 예시 |", "```", "",
  ].join("\n"));
  for (const file of ["src/features/watchlist/WatchStockButton.tsx", "src/app/watchlist/page.tsx", "src/app/api/watchlist/route.ts", "tests/watchlist.test.mjs"]) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), "// documentation fixture\n");
  }
  return root;
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
  reviewPlan(root);
  assert.equal(run(root).code, 0);
  execFileSync("git", ["add", "-f", "BUSINESS_MODEL.md"], { cwd: root });
  const result = run(root);
  assert.equal(result.code, 1);
  assert.match(result.output, /private document is tracked by Git/);
});

test("a product decision change blocks a previously reviewed private plan", (t) => {
  const root = fixture(t);
  reviewPlan(root);
  assert.equal(run(root).code, 0);
  const decision = join(root, "DECISIONS.md");
  writeFileSync(decision, readFileSync(decision, "utf8").replace("no member discussions", "member discussions"));
  const result = run(root);
  assert.equal(result.code, 1);
  assert.match(result.output, /missing or stale decision review/);
  reviewPlan(root);
  assert.equal(run(root).code, 0);
});

test("missing review fails while a Windows line-ending change preserves review", (t) => {
  const root = fixture(t);
  writeFileSync(join(root, "BUSINESS_MODEL.md"), "# Local business plan\n");
  assert.match(run(root).output, /missing or stale decision review/);
  reviewPlan(root);
  const decision = join(root, "DECISIONS.md");
  writeFileSync(decision, "\uFEFF" + readFileSync(decision, "utf8").replace(/\n/g, "\r\n"));
  assert.equal(run(root).code, 0);
});

test("feature guide maps connect specification, design, code and tests with CRLF", (t) => {
  const root = featureFixture(t);
  assert.equal(run(root).code, 0);
  const file = join(root, "DEVELOPMENT.md");
  writeFileSync(file, readFileSync(file, "utf8").replace(/\n/g, "\r\n"));
  const result = run(root, "--guide", "관심종목");
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /기능: 관심종목/);
  assert.match(result.output, /기능 명세:.*PRODUCT_SPEC\.md#관심종목/);
  assert.match(result.output, /디자인 기준:.*DESIGN_SYSTEM\.md#목록/);
  assert.match(result.output, /구현·확장 시작점:.*src\/features\/watchlist/);
  assert.match(result.output, /검증:.*tests\/watchlist\.test\.mjs/);
});

for (const [description, before, after, failure] of [
  ["duplicate feature names", featureRow, featureRow + "\n" + featureRow, /duplicate feature name/],
  ["missing design guidance", "[목록 디자인](./DESIGN_SYSTEM.md#목록)", "화면을 확인", /디자인 기준 requires/],
  ["unanchored specification", "./PRODUCT_SPEC.md#관심종목", "./PRODUCT_SPEC.md", /기능 명세 requires/],
  ["test directory instead of a test file", "./tests/watchlist.test.mjs", "./tests", /검증 requires/],
  ["renamed specification heading", "./PRODUCT_SPEC.md#관심종목", "./PRODUCT_SPEC.md#없는-기능", /missing anchor/],
  ["missing implementation file", "./src/app/watchlist/page.tsx", "./src/app/watchlist/missing.tsx", /broken link/],
  ["duplicate registry sections", "## 기타", "## 작업별 시작점", /expected one registry section/],
]) {
  test("feature map rejects " + description, (t) => {
    const root = featureFixture(t);
    replace(root, "DEVELOPMENT.md", before, after);
    const result = run(root);
    assert.equal(result.code, 1);
    assert.match(result.output, failure);
  });
}

test("new features and routes require exact registrations even with broad directory links", (t) => {
  const root = featureFixture(t);
  mkdirSync(join(root, "src/features/alerts"));
  mkdirSync(join(root, "src/app/alerts"));
  writeFileSync(join(root, "src/app/alerts/page.tsx"), "// page\n");
  writeFileSync(join(root, "src/app/alerts/route.ts"), "// route\n");
  replace(root, "DEVELOPMENT.md", "[기능](./src/features/watchlist)", "[기능](./src/features/watchlist), [전체](./src), [페이지](./src/app), [기능 전체](./src/features)");
  const result = run(root);
  assert.equal(result.code, 1);
  for (const path of ["src/features/alerts", "src/app/alerts/page.tsx", "src/app/alerts/route.ts"]) {
    assert.ok(result.output.includes("missing implementation entry " + path), result.output);
  }
  replace(root, "DEVELOPMENT.md", "[기능](./src/features/watchlist)", "[기능](./src/features/watchlist), [알림](./src/features/alerts), [알림 화면](./src/app/alerts/page.tsx), [알림 API](./src/app/alerts/route.ts)");
  assert.equal(run(root).code, 0);
});

test("feature root must be registered even when one of its files is listed", (t) => {
  const root = featureFixture(t);
  replace(root, "DEVELOPMENT.md", "./src/features/watchlist)", "./src/features/watchlist/WatchStockButton.tsx)");
  const result = run(root);
  assert.equal(result.code, 1);
  assert.match(result.output, /missing implementation entry src\/features\/watchlist/);
});

test("a guide chooses the most specific path and respects directory boundaries", (t) => {
  const root = featureFixture(t);
  const detailRow = featureRow.replace("관심종목 |", "종목 저장 |").replace(/\[기능\].* \| \[저장 회귀\]/, "[저장 버튼](./src/features/watchlist/WatchStockButton.tsx) | [저장 회귀]");
  replace(root, "DEVELOPMENT.md", featureRow, featureRow + "\n" + detailRow);
  for (const query of ["src/features/watchlist/WatchStockButton.tsx", ".\\src\\features\\watchlist\\WatchStockButton.tsx", join(root, "src/features/watchlist/WatchStockButton.tsx")]) {
    const result = run(root, "--guide", query);
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /^기능: 종목 저장\n/);
    assert.doesNotMatch(result.output, /기능: 관심종목/);
  }
  const descendant = run(root, "--guide", "src/features/watchlist/NewButton.tsx");
  assert.equal(descendant.code, 0);
  assert.match(descendant.output, /^기능: 관심종목\n/);
  const sibling = run(root, "--guide", "src/features/watchlist-extra/Button.tsx");
  assert.equal(sibling.code, 1);
  assert.match(sibling.output, /작업별 시작점.*추가하세요/);
});

test("guide uses the current directory without a positional root and rejects unknown names", (t) => {
  const root = featureFixture(t);
  const result = spawnSync(process.execPath, [checker, "--guide", "관심"], { cwd: root, encoding: "utf8" });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /^기능: 관심종목\n/);
  const unknown = run(root, "--guide", "아직없는기능");
  assert.equal(unknown.code, 1);
  assert.match(unknown.output, /일치하는 기능이 없습니다.*작업별 시작점/);
});

test("guide remains available while business review, links and source registrations are unfinished", (t) => {
  const root = featureFixture(t);
  reviewPlan(root);
  append(root, "DECISIONS.md", "A changed product decision.\n");
  append(root, "README.md", "\n[unfinished](./missing.md)\n");
  mkdirSync(join(root, "src/features/alerts"));
  const result = run(root, "--guide", "관심종목");
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /^기능: 관심종목/m);
  assert.doesNotMatch(result.output, /Documentation check|missing or stale decision review/);
  const check = run(root);
  assert.equal(check.code, 1);
  assert.match(check.output, /missing or stale decision review/);
  assert.match(check.output, /broken link/);
  assert.match(check.output, /missing implementation entry src\/features\/alerts/);
});

test("guide only needs the feature map and tolerates unrelated unfinished rows", (t) => {
  const root = featureFixture(t);
  replace(root, "DEVELOPMENT.md", featureRow, featureRow + "\n| 작성 중 | | | | |");
  rmSync(join(root, "AGENTS.md"));
  rmSync(join(root, "README.md"));
  rmSync(join(root, "DECISIONS.md"));
  const result = run(root, "--guide", "관심종목");
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /^기능: 관심종목/m);
});
