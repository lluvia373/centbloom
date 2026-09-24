// Local evaluation only: FMP facts must not enter public/ or a production bundle.
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicJson, collectionLock } from './guru-source-cache.mjs';
import { companyDatasets, companySymbol, companyCoverage, mergeCompanyObservation, isCompanySnapshot } from '../src/features/market/company-data.ts';
import { createFmpClient } from '../src/features/market/server/fmp.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export function parseCompanyArgs(args) {
  const options = { symbols: [], requests: 20, audit: false };
  for (const arg of args) {
    if (arg.startsWith('--symbols=')) options.symbols = [...new Set(arg.slice(10).split(',').map(companySymbol))];
    else if (/^--requests=\d+$/.test(arg)) options.requests = Number(arg.slice(11));
    else if (arg === '--audit') options.audit = true;
    else throw Error('Unknown company-data option');
  }
  if (!options.symbols.length || options.symbols.length > 200 || options.requests < 1 || options.requests > 200) throw Error('Pass 1–200 explicit provider symbols and a request budget of 1–200.');
  return options;
}

export async function prepareCompanyData(options, {
  directory = resolve(root, 'work/company-data/fmp'), env = process.env, request = fetch, now = Date.now,
} = {}) {
  if (env.NODE_ENV === 'production') throw Error('FMP evaluation is disabled in production.');
  await mkdir(directory, { recursive: true });
  const unlock = await collectionLock(resolve(directory, 'collector.lock'));
  try {
    const budgetPath = resolve(directory, 'budget.json'), today = new Date(now()).toISOString().slice(0, 10);
    const saved = await readJson(budgetPath);
    if (saved && (!/^\d{4}-\d{2}-\d{2}$/.test(saved.day) || saved.day > today || !Number.isSafeInteger(saved.used) || saved.used < 0)) throw Error('Invalid request budget; inspect before resuming.');
    const budget = saved?.day === today ? saved : { day: today, used: 0 };
    let used = 0;
    const client = createFmpClient({ apiKey: env.FMP_API_KEY, enabled: env.FMP_EVALUATION_ENABLED === 'true', request, now,
      reserveRequest: async () => {
        // Persistent budget across collector restarts. Other tools/accounts may consume more.
        if (used >= options.requests || budget.used >= 200) return false;
        used++; budget.used++; await atomicJson(budgetPath, budget); return true;
      } });
    const observations = [];
    const missing = [];
    for (const rawSymbol of options.symbols) {
      const symbol = companySymbol(rawSymbol), path = resolve(directory, symbol + '.json');
      const previous = await readJson(path);
      if (previous && !isCompanySnapshot(previous, symbol)) throw Error('Stored company identity is invalid.');
      if (options.audit) {
        if (previous) observations.push(previous); else missing.push(symbol);
        continue;
      }
      const datasets = {};
      for (const name of companyDatasets) {
        const result = await client(name, symbol);
        datasets[name] = mergeCompanyObservation(previous?.datasets[name], result, name);
      }
      const snapshot = { version: 1, provider: 'fmp', usage: 'local-evaluation', symbol, updatedAt: new Date(now()).toISOString(), realtimeVerified: false, datasets };
      // Single atomic publication; partial failure never destroys the retained last-good rows.
      await atomicJson(path, snapshot); observations.push(snapshot);
    }
    const report = { generatedAt: new Date(now()).toISOString(), requestedSymbols: options.symbols.length,
      ...companyCoverage(observations), missingSymbols: missing, requestsUsed: used,
      issues: observations.flatMap(item => companyDatasets.filter(name => item.datasets[name].issue).map(name => ({ symbol: item.symbol, dataset: name, issue: item.datasets[name].issue }))),
      markets: {
        KR: 'not-connected: KOSCOM realtime and KSD structured dividends need access; existing DART is separate',
        US: 'FMP evaluation only; realtime, complete history and full-universe coverage unverified',
        JP: 'symbol mapping, access and realtime unverified', HK: 'symbol mapping, access and realtime unverified', CN: 'symbol mapping, access and realtime unverified',
      },
      // Persisted observations cannot certify what a browser displayed, or a live subscription.
      allRequestedDataReceived: missing.length === 0 && observations.length > 0 && observations.every(item => companyDatasets.every(name => item.datasets[name].status === 'received')),
      allStocksRealtimeDividendsEarningsDisplayed: false,
    };
    await atomicJson(resolve(directory, 'coverage.json'), report);
    return report;
  } finally { await unlock(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = await prepareCompanyData(parseCompanyArgs(process.argv.slice(2)));
    console.log(JSON.stringify(report, null, 2));
    if (!report.allRequestedDataReceived) process.exitCode = 2;
  } catch (error) {
    const code = typeof error?.code === 'string' && /^[A-Z_]+$/.test(error.code) ? error.code : 'VALIDATION';
    console.error(`Company-data preparation failed [${code}]. Check options, local key/access, and collector lock. Credentials and provider responses are not logged.`);
    process.exitCode = 1;
  }
}
