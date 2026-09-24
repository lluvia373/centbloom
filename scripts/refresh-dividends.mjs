// Offline public-data refresh. Never run this in a page request or send a user's ledger.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export const dividendCollectors = [
  'prepare-dart-dividends.mjs',
  'prepare-foreign-dividends.mjs',
  'prepare-etf-dividends.mjs',
  'prepare-common-dividends.mjs',
];

export async function refreshDividendSources(run) {
  const results = [];
  // Each collector has its own source limits and atomic, per-source preservation.
  // A failed provider must not prevent the other providers from refreshing.
  for (const file of dividendCollectors) {
    try { results.push({ source: file, code: await run(file) }); }
    catch { results.push({ source: file, code: 1 }); }
  }
  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const results = await refreshDividendSources(file => new Promise((done, reject) => {
    const child = spawn(process.execPath, ['--env-file-if-exists=.env.development.local', resolve(root, 'scripts', file)], {
      cwd: root, env: process.env, stdio: 'inherit', shell: false,
    });
    child.once('error', reject);
    child.once('exit', code => done(code ?? 1));
  }));
  console.log(JSON.stringify({ refresh: results }));
  process.exitCode = results.some(result => result.code !== 0) ? 1 : 0;
}
