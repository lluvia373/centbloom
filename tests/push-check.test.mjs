import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { checkPush, parsePushUpdates, pushCheckCommands } from "./check-push.mjs";
import { installGitHooks } from "./install-git-hooks.mjs";

const head = "a".repeat(40);
const old = "b".repeat(40);
const zero = "0".repeat(40);
const checker = fileURLToPath(new URL("./check-push.mjs", import.meta.url));
const hook = readFileSync(new URL("../.githooks/pre-push", import.meta.url), "utf8");
const update = (local = head, remote = old) => parsePushUpdates(`refs/heads/main ${local} refs/heads/main ${remote}`);

function fixture(t) {
  const base = realpathSync(tmpdir());
  const root = mkdtempSync(join(base, "centbloom-push-"));
  t.after(() => {
    if (dirname(root) !== base || !root.startsWith(join(base, "centbloom-push-"))) {
      throw new Error("Refusing to remove a path outside the test fixture directory");
    }
    rmSync(root, { recursive: true, force: true });
  });
  mkdirSync(join(root, "tests"));
  mkdirSync(join(root, ".githooks"));
  writeFileSync(join(root, "tests", "example.test.mjs"), "");
  writeFileSync(join(root, "config.ts"), "");
  writeFileSync(join(root, ".githooks", "pre-push"), hook);
  return root;
}

function runner(root, { dirty = "", finalDirty = "", wrongCommit = false, changedHead = false, failStep = 0 } = {}) {
  const calls = [];
  let completed = 0;
  const execute = (command, args, options) => {
    calls.push([command, args, options]);
    if (command === "git") {
      let stdout;
      if (args[1] === "--show-toplevel") stdout = root;
      else if (args[1] === "--local-env-vars") stdout = "GIT_DIR\nGIT_WORK_TREE\nGIT_INDEX_FILE\nGIT_CONFIG_COUNT";
      else if (args[1] === "HEAD") stdout = changedHead && completed ? old : head;
      else if (args[1]?.endsWith("^{commit}")) stdout = wrongCommit ? old : head;
      else if (args[0] === "status") stdout = completed ? finalDirty : dirty;
      else throw new Error(`Unexpected git command: ${args.join(" ")}`);
      return { status: 0, stdout, stderr: "" };
    }
    assert.equal(command, process.execPath);
    completed += 1;
    return { status: failStep === completed ? 1 : 0 };
  };
  return { calls, execute, checks: () => calls.filter(([command]) => command !== "git") };
}

test("pre-push input handles CRLF and rejects malformed records", () => {
  assert.equal(parsePushUpdates(`refs/heads/main ${head} refs/heads/main ${old}\r\n`).length, 1);
  assert.throws(() => parsePushUpdates("refs/heads/main invalid"), /Invalid Git pre-push input/);
});

test("deletion and unchanged refs skip checks, including through the hook CLI", () => {
  for (const updates of [[], update(zero), update(head, head)]) {
    checkPush({ updates, execute: () => assert.fail("No command should run"), log: () => {} });
  }
  const result = spawnSync(process.execPath, [checker, "--pre-push"], {
    input: `refs/heads/main ${zero} refs/heads/main ${old}\n`, encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const malformed = spawnSync(process.execPath, [checker, "--pre-push"], { input: "invalid", encoding: "utf8" });
  assert.equal(malformed.status, 1);
});

test("a clean matching HEAD runs the full ordered pipeline without pushing", (t) => {
  const root = fixture(t);
  const fake = runner(root);
  checkPush({ cwd: root, updates: update(), execute: fake.execute, log: () => {} });
  assert.deepEqual(fake.checks().map(([, args]) => args), pushCheckCommands(root).map(([, args]) => args));
  assert.equal(fake.checks().length, 6);
  assert.equal(fake.calls.some(([command, args]) => command === "git" && args[0] === "push"), false);
});

test("manual invocation only checks the current HEAD", (t) => {
  const root = fixture(t);
  const fake = runner(root);
  checkPush({ cwd: root, execute: fake.execute, log: () => {} });
  assert.equal(fake.checks().length, 6);
  assert.equal(fake.calls.some(([command, args]) => command === "git" && args[0] === "push"), false);
});

test("hook repository environment does not leak into tests or their temporary Git repositories", (t) => {
  const root = fixture(t);
  const fake = runner(root);
  const env = { ...process.env, GIT_DIR: "original/.git", GIT_WORK_TREE: "original", GIT_INDEX_FILE: "original/index", GIT_CONFIG_COUNT: "1" };
  checkPush({ cwd: root, env, updates: update(), execute: fake.execute, log: () => {} });
  for (const [, , options] of fake.checks()) {
    for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_CONFIG_COUNT"]) assert.equal(options.env[key], undefined);
    assert.equal(options.env.PATH, process.env.PATH);
  }
  assert.equal(env.GIT_DIR, "original/.git");
});

test("dirty tracked and untracked files block before any checks", (t) => {
  const root = fixture(t);
  for (const dirty of [" M src/page.tsx", "?? src/new.tsx"]) {
    const fake = runner(root, { dirty });
    assert.throws(() => checkPush({ cwd: root, updates: update(), execute: fake.execute, log: () => {} }), /Uncommitted/);
    assert.equal(fake.checks().length, 0);
  }
});

test("a pushed ref outside HEAD is rejected", (t) => {
  const root = fixture(t);
  const fake = runner(root, { wrongCommit: true });
  assert.throws(() => checkPush({ cwd: root, updates: update(), execute: fake.execute, log: () => {} }), /checked-out HEAD/);
  assert.equal(fake.checks().length, 0);
});

test("a failed check stops the pipeline before the build", (t) => {
  const root = fixture(t);
  const fake = runner(root, { failStep: 3 });
  assert.throws(() => checkPush({ cwd: root, updates: update(), execute: fake.execute, log: () => {} }), /ESLint failed/);
  assert.equal(fake.checks().length, 3);
});

test("HEAD or source changes during checks invalidate the result", (t) => {
  const root = fixture(t);
  for (const options of [{ changedHead: true }, { finalDirty: " M src/page.tsx" }]) {
    const fake = runner(root, options);
    assert.throws(() => checkPush({ cwd: root, updates: update(), execute: fake.execute, log: () => {} }), /HEAD changed|Uncommitted/);
  }
});

function gitFixture(t) {
  const root = fixture(t);
  const env = { ...process.env, CI: "", CF_PAGES: "", WORKERS_CI: "", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(root, "no-global-config") };
  const variables = spawnSync("git", ["rev-parse", "--local-env-vars"], { encoding: "utf8", windowsHide: true });
  assert.equal(variables.status, 0, variables.stderr);
  for (const key of variables.stdout.trim().split(/\r?\n/)) delete env[key];
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: root, env, encoding: "utf8", windowsHide: true });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git("init", "--quiet");
  return { root, env, git };
}

test("installer configures a temporary checkout and accepts reinstalling", (t) => {
  const { root, env, git } = gitFixture(t);
  assert.equal(hook.includes("\r"), false);
  for (let i = 0; i < 2; i += 1) {
    assert.equal(installGitHooks({ cwd: root, env, log: () => {} }).installed, true);
    assert.equal(git("config", "--local", "--get", "core.hooksPath"), ".githooks");
  }
});

test("installer preserves custom hooksPath", (t) => {
  const { root, env, git } = gitFixture(t);
  git("config", "--local", "core.hooksPath", "existing-hooks");
  assert.equal(installGitHooks({ cwd: root, env, log: () => {} }).installed, false);
  assert.equal(git("config", "--local", "--get", "core.hooksPath"), "existing-hooks");
});

test("installer preserves active default hooks", (t) => {
  const { root, env } = gitFixture(t);
  const existing = join(root, ".git", "hooks", "pre-commit");
  writeFileSync(existing, "#!/bin/sh\nexit 0\n");
  chmodSync(existing, 0o755);
  assert.equal(installGitHooks({ cwd: root, env, log: () => {} }).installed, false);
  assert.equal(readFileSync(existing, "utf8"), "#!/bin/sh\nexit 0\n");
});

test("installer skips CI, Cloudflare and archives without Git", (t) => {
  const root = fixture(t);
  for (const key of ["CI", "CF_PAGES", "WORKERS_CI"]) {
    assert.equal(installGitHooks({ cwd: root, env: { ...process.env, [key]: "1" }, log: () => {} }).installed, false);
  }
  assert.equal(installGitHooks({ cwd: root, env: { ...process.env, CI: "", CF_PAGES: "", WORKERS_CI: "" }, log: () => {} }).installed, false);
});
