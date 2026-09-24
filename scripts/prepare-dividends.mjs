// Public data collection is deliberately outside the page request. Node 24+.
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicJson, collectionLock, createSecClient, createSourceCache } from './guru-source-cache.mjs';
import { AAPL_CIK, COLLECTION_FROM, parseAppleDividend, prepareDividendSnapshot } from '../src/features/dividends/sec.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
export async function collectDividends({ source, previous = null, now }) {
  const submissionSource = await source.get(`https://data.sec.gov/submissions/CIK${AAPL_CIK}.json`, { ttl: 6 * 60 * 60_000 });
  const fetched = [submissionSource.fetchedAt];
  const submission = JSON.parse(submissionSource.text);
  if (Number(submission.cik) !== Number(AAPL_CIK) || !submission.tickers?.includes('AAPL')) throw Error('SEC issuer mapping changed');
  const rows = submission.filings?.recent;
  if (!Array.isArray(rows?.form) || ['filingDate', 'accessionNumber', 'primaryDocument', 'items'].some(key => !Array.isArray(rows[key]) || rows[key].length !== rows.form.length)) throw Error('Incomplete SEC filing columns');
  const filings = rows.form.flatMap((form, i) => (form === '8-K' || form === '8-K/A') && rows.filingDate[i] >= COLLECTION_FROM && rows.items[i].split(',').includes('2.02')
    ? [{ date: rows.filingDate[i], accession: rows.accessionNumber[i], document: rows.primaryDocument[i] }] : []);
  if (!filings.length || filings.length > 24) throw Error('Unexpected dividend filing coverage');
  const candidates = [];
  for (const filing of filings) {
    if (!/^\d{10}-\d{2}-\d{6}$/.test(filing.accession) || !/^[\w.-]+\.htm$/.test(filing.document)) throw Error('Invalid SEC filing identity');
    const base = `https://www.sec.gov/Archives/edgar/data/320193/${filing.accession.replaceAll('-', '')}/`;
    // Periodically re-read original documents so corrections do not stay cached forever.
    const primary = await source.get(base + filing.document, { ttl: 24 * 60 * 60_000 });
    const links = [...new Set([...primary.text.matchAll(/href="([^"]+)"/gi)].map(match => match[1]).filter(path => /^[\w.-]*ex99[\w.-]*\.htm$/i.test(path)))];
    if (links.length !== 1) throw Error('Unrecognized earnings exhibit; retain prepared dividends');
    const sourceUrl = base + links[0];
    const exhibit = await source.get(sourceUrl, { ttl: 24 * 60 * 60_000 });
    fetched.push(primary.fetchedAt, exhibit.fetchedAt);
    candidates.push(parseAppleDividend(exhibit.text, sourceUrl, filing.date));
  }
  const completedAt = now ?? new Date().toISOString();
  if (fetched.some(value => !Number.isFinite(value) || value > Date.parse(completedAt))) throw Error('Invalid source check time');
  return prepareDividendSnapshot(candidates, previous, completedAt, new Date(Math.min(...fetched)).toISOString());
}

async function prepare() {
  const storage = resolve(root, 'work/dividends/sources');
  await mkdir(storage, { recursive: true });
  const unlock = await collectionLock(resolve(dirname(storage), 'collection.lock'));
  try {
    const output = resolve(root, 'src/features/dividends/prepared.json');
    let previous = null;
    try { const value = JSON.parse(await readFile(output, 'utf8')); if (value.events.length) previous = value; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const source = createSourceCache(storage, createSecClient(process.env.SEC_USER_AGENT));
    const started = performance.now();
    const result = await collectDividends({ source, previous });
    await atomicJson(output, result);
    console.log(JSON.stringify({ events: result.events.length, pending: result.pending.length, coverage: result.coverage,
      checkedAt: result.checkedAt, collectionMs: Math.round(performance.now() - started), bytes: JSON.stringify(result).length }));
  } finally { await unlock(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 2) throw Error('No command arguments supported');
  prepare().catch(error => { console.error(error.message); process.exitCode = 1; });
}
