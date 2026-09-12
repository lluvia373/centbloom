import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function installGitHooks({ cwd = process.cwd(), env = process.env, log = console.log } = {}) {
  const skip = (reason) => {
    log(`[git hooks] Skipped: ${reason}`);
    return { installed: false, reason };
  };
  if (["CI", "CF_PAGES", "WORKERS_CI"].some((key) => env[key] && !/^(false|0)$/i.test(env[key]))) {
    return skip("CI or Cloudflare build environment.");
  }
  const git = (...args) => spawnSync("git", args, { cwd, env, encoding: "utf8", windowsHide: true });
  const repository = git("rev-parse", "--show-toplevel");
  if (repository.error && repository.error.code !== "ENOENT") throw repository.error;
  if (repository.error?.code === "ENOENT" || repository.status !== 0) return skip("Git checkout is unavailable.");
  cwd = repository.stdout.trim();
  const hookDirectory = resolve(cwd, ".githooks");
  const configured = git("config", "--get", "core.hooksPath");
  if (configured.error || ![0, 1].includes(configured.status)) throw new Error("Cannot inspect core.hooksPath.");
  const current = configured.stdout.trim();
  if (current && resolve(cwd, current) !== hookDirectory) {
    return skip(`Existing core.hooksPath is preserved: ${current}`);
  }
  if (!current) {
    const hooks = git("rev-parse", "--git-path", "hooks");
    if (hooks.status !== 0) throw new Error("Cannot inspect existing Git hooks.");
    const directory = resolve(cwd, hooks.stdout.trim());
    const active = existsSync(directory) && readdirSync(directory).some((name) => {
      const file = resolve(directory, name);
      return !name.endsWith(".sample") && statSync(file).isFile()
        && (process.platform === "win32" || (statSync(file).mode & 0o111) !== 0);
    });
    if (active) return skip("Existing active Git hooks are preserved; integrate the pre-push check manually.");
  }
  const hook = resolve(hookDirectory, "pre-push");
  if (!existsSync(hook) || readFileSync(hook, "utf8").includes("\r")) {
    throw new Error(".githooks/pre-push must exist with LF line endings.");
  }
  chmodSync(hook, 0o755);
  const installed = git("config", "--local", "core.hooksPath", ".githooks");
  if (installed.error || installed.status !== 0) throw new Error("Cannot set local core.hooksPath.");
  log("[git hooks] Installed: git push will run checks before sending changes.");
  return { installed: true };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    installGitHooks();
  } catch (error) {
    console.error(`[git hooks] ${error.message}`);
    process.exitCode = 1;
  }
}
