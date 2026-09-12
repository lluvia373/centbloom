import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function parsePushUpdates(input) {
  return input.split(/\r?\n/).filter((line) => line.trim()).map((line) => {
    const fields = line.trim().split(/\s+/);
    if (fields.length !== 4 || !fields[1].match(/^(?:[a-f\d]{40}|[a-f\d]{64})$/i)
      || !fields[3].match(/^(?:[a-f\d]{40}|[a-f\d]{64})$/i)) {
      throw new Error("Invalid Git pre-push input; push was not checked.");
    }
    const [localRef, localOid, remoteRef, remoteOid] = fields;
    return { localRef, localOid, remoteRef, remoteOid };
  });
}

export function pushCheckCommands(root) {
  const rootSources = readdirSync(root).filter((name) => /\.(mjs|ts)$/.test(name)).sort();
  const tests = readdirSync(resolve(root, "tests")).filter((name) => name.endsWith(".test.mjs"))
    .sort().map((name) => `tests/${name}`);
  if (!tests.length) throw new Error("No test files found; push was not checked.");
  return [
    ["Documentation", ["tests/check-docs.mjs"]],
    ["Design rules", ["tests/check-design.mjs"]],
    ["ESLint", ["node_modules/eslint/bin/eslint.js", "src", "tests", "brand", ...rootSources]],
    ["Import cycles", ["tests/check-import-cycles.mjs"]],
    ["Tests", ["--test", ...tests]],
    ["Production build and types", ["node_modules/next/dist/bin/next", "build", "--webpack"]],
  ];
}

export function checkPush({ cwd = process.cwd(), updates, env = process.env, execute = spawnSync, log = console.log } = {}) {
  const changes = updates?.filter(({ localOid, remoteOid }) => !/^0+$/.test(localOid) && localOid !== remoteOid);
  if (changes?.length === 0) {
    log("[push check] No new objects to check (deletion or unchanged refs).");
    return;
  }
  const git = (...args) => {
    const result = execute("git", args, { cwd, env, encoding: "utf8", windowsHide: true });
    if (result.error || result.status !== 0) {
      throw new Error(`Git inspection failed: ${result.error?.message ?? result.stderr?.trim() ?? args.join(" ")}`);
    }
    return result.stdout.trim();
  };
  const root = git("rev-parse", "--show-toplevel");
  const localGitVariables = git("rev-parse", "--local-env-vars").split(/\r?\n/);
  env = { ...env };
  for (const key of localGitVariables) delete env[key];
  cwd = root;
  const head = git("rev-parse", "HEAD");
  for (const { localRef, localOid } of changes ?? []) {
    const commit = git("rev-parse", `${localOid}^{commit}`);
    if (commit !== head) {
      throw new Error(`${localRef} does not point to the checked-out HEAD. Check out the commit being pushed and retry.`);
    }
  }
  const assertUnchanged = () => {
    if (git("rev-parse", "HEAD") !== head) throw new Error("HEAD changed during checks. Commit the intended changes and retry.");
    if (git("status", "--porcelain=v1", "--untracked-files=all", "--ignore-submodules=none")) {
      throw new Error("Uncommitted tracked or untracked files exist. Commit the intended changes before running push checks.");
    }
  };
  assertUnchanged();
  for (const [label, args] of pushCheckCommands(root)) {
    log(`[push check] ${label}`);
    const result = execute(process.execPath, args, { cwd: root, env, stdio: "inherit", windowsHide: true });
    if (result.error || result.status !== 0) {
      throw new Error(`${label} failed (${result.error?.message ?? result.signal ?? result.status}); push stopped.`);
    }
  }
  assertUnchanged();
  log("[push check] All checks passed for the current committed HEAD.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && args[0] !== "--pre-push")) {
      throw new Error("Usage: node tests/check-push.mjs [--pre-push]");
    }
    const updates = args[0] === "--pre-push" ? parsePushUpdates(readFileSync(0, "utf8")) : undefined;
    checkPush({ updates });
  } catch (error) {
    console.error(`[push check] ${error.message}`);
    process.exitCode = 1;
  }
}
