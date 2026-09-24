// Company-common data only. No user IDs, portfolio IDs, quantities, or ledgers enter this job.
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SaxesParser } from 'saxes';
import { atomicJson, collectionLock, createSecClient, createSourceCache, sha256 } from './guru-source-cache.mjs';
import { createDartClient, collectKoreanDividendFeed } from './prepare-dart-dividends.mjs';
import { collectForeignDividends, dividendCalendars } from './prepare-foreign-dividends.mjs';
import { foreignIssuers } from '../src/features/dividends/foreign.ts';
import { koreanDividendCompanies } from '../src/features/dividends/korea.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
export const directoryUrls = {
  sec: 'https://www.sec.gov/files/company_tickers_exchange.json',
  dart: 'https://opendart.fss.or.kr/api/corpCode.xml',
};
const symbolPattern = /^[A-Z0-9][A-Z0-9.^=-]{0,29}$/;
const from = '2026-01-01';
const readJson = async path => {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
};

export function parseSecDirectory(input) {
  if (!Array.isArray(input.fields) || !Array.isArray(input.data) || !input.data.length || input.data.length > 100_000)
    throw Error('Invalid SEC company directory');
  const fields = ['cik', 'name', 'ticker', 'exchange'].map(key => input.fields.indexOf(key));
  if (fields.some(index => index < 0)) throw Error('Missing SEC directory columns');
  const seen = new Set();
  return input.data.map(row => {
    const [cik, name, ticker, exchange] = fields.map(index => row[index]);
    const symbol = typeof ticker === 'string' ? ticker.replaceAll('.', '-') : '';
    if (!Number.isSafeInteger(cik) || cik <= 0 || !symbolPattern.test(symbol) || typeof name !== 'string' || !name ||
        (exchange !== null && typeof exchange !== 'string') || seen.has(symbol)) throw Error('Ambiguous SEC symbol mapping');
    seen.add(symbol);
    return { id: `sec:${cik}:${symbol}`, source: 'sec', cik, symbol, name, exchange };
  });
}

export function parseDartDirectory(xml) {
  if (xml.length > 64 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw Error('Invalid DART directory');
  const parser = new SaxesParser(), result = [], seen = new Set();
  let row = null, tag = '', value = '';
  parser.on('opentag', node => { tag = node.name; value = ''; if (tag === 'list') row = {}; });
  parser.on('text', text => { value += text; });
  parser.on('closetag', node => {
    if (row && ['corp_code', 'corp_name', 'stock_code'].includes(node.name)) row[node.name] = value.trim();
    if (node.name !== 'list' || !row) return;
    if (row.stock_code) {
      if (!/^\d{8}$/.test(row.corp_code) || !/^[A-Z0-9]{6}$/.test(row.stock_code) || !row.corp_name || seen.has(row.stock_code))
        throw Error('Ambiguous DART stock mapping');
      seen.add(row.stock_code);
      result.push({ id: `dart:${row.corp_code}`, source: 'dart', corpCode: row.corp_code, stockCode: row.stock_code, name: row.corp_name });
    }
    row = null;
  });
  parser.write(xml).close();
  if (!result.length) throw Error('Empty DART listed-company directory');
  return result;
}

export function parseCommonArgs(args) {
  const options = { limit: Infinity, source: 'all', only: [], catalogOnly: false, requestBudget: 240 };
  for (const arg of args) {
    if (/^--limit=\d+$/.test(arg)) options.limit = Number(arg.split('=')[1]);
    else if (/^--requests=\d+$/.test(arg)) options.requestBudget = Number(arg.split('=')[1]);
    else if (/^--source=(all|sec|dart)$/.test(arg)) options.source = arg.split('=')[1];
    else if (arg === '--catalog-only') options.catalogOnly = true;
    else if (/^--only=/.test(arg)) options.only = arg.slice(7).split(',');
    else throw Error('Unknown common-dividend option');
  }
  if ((options.limit !== Infinity && (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 100_000)) || options.requestBudget < 1 || options.requestBudget > 2000 ||
      options.only.some(symbol => !symbolPattern.test(symbol))) throw Error('Invalid common-dividend option');
  return options;
}

/** The limit is a resumable work budget, never a supported-company allowlist. */
export function dueCompanies(catalog, records, options, now) {
  const requested = new Set(options.only);
  const scope = catalog.filter(company => (options.source === 'all' || options.source === company.source) &&
    (!requested.size || requested.has(company.symbol) || requested.has(company.stockCode)));
  if (requested.size && [...requested].some(symbol => !scope.some(row => row.symbol === symbol || row.stockCode === symbol)))
    throw Error('Requested company is not in the verified directory');
  const due = scope.filter(company => requested.size || !records[company.id]?.attemptedAt ||
    Date.parse(now) - Date.parse(records[company.id].attemptedAt) >= 86400000)
    .sort((a, b) => (records[a.id]?.attemptedAt ?? '').localeCompare(records[b.id]?.attemptedAt ?? '') || a.id.localeCompare(b.id));
  const queues = ['dart', 'sec'].map(source => due.filter(company => company.source === source));
  const fair = [];
  while (fair.length < options.limit && queues.some(queue => queue.length)) {
    for (const queue of queues) if (queue.length && fair.length < options.limit) fair.push(queue.shift());
  }
  return fair;
}

/** Reject silent deletion, duplicate IDs and older observations before promoting a company. */
export function acceptCompanyFeed(previous, next) {
  if (next.version !== 1 || !Array.isArray(next.events) || !Array.isArray(next.symbols) || !next.symbols.length ||
      !Number.isFinite(Date.parse(next.checkedAt)) || previous && next.checkedAt < previous.checkedAt)
    throw Error('Invalid or regressing company feed');
  const symbols = new Set(next.symbols.map(row => row.symbol)), ids = new Set();
  if (symbols.size !== next.symbols.length) throw Error('Duplicate company coverage');
  for (const event of next.events) {
    if (ids.has(event.id) || !symbols.has(event.symbol)) throw Error('Duplicate or unmapped dividend');
    ids.add(event.id);
  }
  for (const event of previous?.events ?? []) {
    if (!ids.has(event.id)) throw Error('Previously stored dividend disappeared');
    const newer = next.events.find(row => row.id === event.id);
    if (['amountPerShare', 'recordDate', 'paymentDate'].some(key => event[key] !== newer[key]) &&
        !(event.revisionReceipts?.length && event.revisionReceipts.every(receipt => newer.revisionReceipts?.includes(receipt)) &&
          newer.revisionReceipts.some(receipt => !event.revisionReceipts.includes(receipt))))
      throw Error('Unlinked dividend correction');
  }
  return next;
}

function failedFeed(previous, company, now, reason) {
  const symbols = previous?.symbols ?? (company.symbol ? [{ symbol: company.symbol, from, through: now.slice(0, 10), checkedAt: null }] : []);
  return { version: 1, checkedAt: now, sourceCheckedAt: previous?.sourceCheckedAt ?? null,
    events: previous?.events ?? [], symbols: symbols.map(row => ({ ...row, status: 'failed', reason })), issue: reason };
}

export async function collectCompany(company, previous, { sources, calendars, now }) {
  if (company.source === 'sec') {
    const reviewed = foreignIssuers.find(row => row.cik === company.cik && row.symbol === company.symbol);
    const issuer = reviewed ?? { ...company, kind: 'discovered', shareHistoryFrom: from };
    return collectForeignDividends({ source: sources.sec, previous, calendars, now, issuers: [issuer] });
  }
  const profile = JSON.parse((await sources.dart.get(`https://opendart.fss.or.kr/api/company.json?corp_code=${company.corpCode}`, { ttl: 86400000 })).text);
  if (profile.status !== '000' || profile.corp_code !== company.corpCode || profile.stock_code !== company.stockCode || !['Y', 'K'].includes(profile.corp_cls))
    throw Error('DART listing market or common-share identity requires review');
  const reviewed = koreanDividendCompanies.find(row => row.corpCode === company.corpCode);
  const instrument = reviewed ?? { ...company, symbol: `${company.stockCode}.${profile.corp_cls === 'Y' ? 'KS' : 'KQ'}`,
    shareHistoryFrom: from, factsCheckedUrl: `https://dart.fss.or.kr/dsae001/main.do?selectKey=corp&textCrpNm=${company.stockCode}` };
  const result = await collectKoreanDividendFeed({ source: sources.dart, calendar: calendars.find(row => row.id === 'KR'), previous,
    companies: [instrument], through: new Date(Date.parse(now) - 86400000).toISOString().slice(0, 10), now: () => now });
  if (!reviewed) {
    // Directory membership alone does not certify domicile, tax class or older split history.
    for (const event of result.events) { event.issuerCountry = 'unknown'; event.treatyEligible = false; }
  }
  return result;
}

/** Immutable, per-symbol public files. The small manifest switches only after every file exists. */
export async function readPublishedCompanies(destination) {
  const manifest = await readJson(resolve(destination, 'manifest.json'));
  if (!manifest) return [];
  if (manifest.version !== 1 || !manifest.symbols || !Number.isFinite(Date.parse(manifest.generatedAt))) throw Error('Invalid previous dividend manifest');
  const result = [];
  for (const [symbol, entry] of Object.entries(manifest.symbols)) {
    if (!symbolPattern.test(symbol) || !/^\/data\/dividends\/[a-f0-9]{64}\.json$/.test(entry.path)) throw Error('Invalid prior dividend asset');
    const feed = await readJson(resolve(destination, entry.path.split('/').at(-1)));
    if (!feed || feed.symbols?.length !== 1 || feed.symbols[0].symbol !== symbol ||
        entry.path !== `/data/dividends/${sha256(JSON.stringify(feed))}.json`) throw Error('Prior dividend asset corrupt; preserve and inspect');
    result.push({ owner: entry.owner ?? 'seed', feed });
  }
  return result;
}

export async function publishCommonDividends(destination, records, seeds, catalog, now) {
  await mkdir(destination, { recursive: true });
  const selected = new Map();
  const add = (owner, feed) => {
    for (const coverage of feed.symbols) {
      if (!symbolPattern.test(coverage.symbol)) throw Error('Unsafe dividend symbol');
      const old = selected.get(coverage.symbol);
      if (old && old.owner !== 'seed' && owner !== 'seed' && old.owner !== owner) throw Error('Conflicting company ownership for a symbol');
      if (old && old.feed.checkedAt > feed.checkedAt) continue;
      selected.set(coverage.symbol, { owner: owner === 'seed' ? old?.owner ?? owner : owner, feed: { version: 1, checkedAt: feed.checkedAt, sourceCheckedAt: coverage.checkedAt,
        symbols: [coverage], events: feed.events.filter(event => event.symbol === coverage.symbol) } });
    }
  };
  for (const row of await readPublishedCompanies(destination)) add(row.owner, row.feed);
  seeds.forEach(feed => add('seed', feed));
  Object.entries(records).forEach(([id, row]) => { if (row.feed) add(id, row.feed); });
  const symbols = {};
  for (const [symbol, { feed, owner }] of selected) {
    const hash = sha256(JSON.stringify(feed)), name = `${hash}.json`;
    const stored = await readJson(resolve(destination, name));
    if (stored && sha256(JSON.stringify(stored)) !== hash) throw Error('Immutable dividend file corrupt');
    if (!stored) await atomicJson(resolve(destination, name), feed);
    symbols[symbol] = { path: `/data/dividends/${name}`, status: feed.symbols[0].status, owner };
  }
  const manifest = { version: 1, generatedAt: now, directoryCount: catalog.length,
    attemptedCompanies: Object.keys(records).length, symbols };
  await atomicJson(resolve(destination, 'manifest.json'), manifest);
  return manifest;
}

export async function prepareCommonDividends(options = parseCommonArgs([])) {
  const storage = resolve(root, 'work/dividends/common');
  await mkdir(storage, { recursive: true });
  const unlock = await collectionLock(resolve(storage, 'collection.lock'));
  try {
    const statePath = resolve(storage, 'state.json');
    const state = await readJson(statePath) ?? { version: 1, directories: {}, records: {} };
    if (state.version !== 1 || !state.records || !state.directories) throw Error('Invalid common store; preserve it');
    const now = new Date().toISOString(), sources = {}, issues = [];
    let requests = 0, budgetReached = false;
    for (const source of ['dart', 'sec'].filter(name => options.source === 'all' || name === options.source)) {
      const sourceDir = resolve(storage, source);
      await mkdir(sourceDir, { recursive: true });
      try {
        const client = source === 'dart' ? createDartClient(process.env.OPEN_DART_API_KEY) : createSecClient(process.env.SEC_USER_AGENT);
        sources[source] = createSourceCache(sourceDir, url => {
          if (requests >= options.requestBudget) { budgetReached = true; throw Error('Common-dividend request budget reached; resume next run'); }
          requests++;
          return client(url);
        });
        const response = await sources[source].get(directoryUrls[source], { ttl: 86400000 });
        const companies = source === 'dart' ? parseDartDirectory(response.text) : parseSecDirectory(JSON.parse(response.text));
        // A transient directory regression never erases stored companies or their history.
        state.directories[source] = { checkedAt: new Date(response.fetchedAt).toISOString(), companies };
      } catch (error) { issues.push({ source, reason: error.message }); delete sources[source]; }
    }
    const catalog = Object.values(state.directories).flatMap(row => row.companies);
    if (!catalog.length) throw Error('No verified company directory available');
    await atomicJson(statePath, state);
    const published = await readPublishedCompanies(resolve(root, 'public/data/dividends'));
    const seeds = [...published.map(row => row.feed), ...await Promise.all(['korea', 'foreign', 'etf'].map(name => readJson(resolve(root, `src/features/dividends/prepared-${name}.json`))))]
      .sort((a, b) => b.checkedAt.localeCompare(a.checkedAt));
    const calendars = options.catalogOnly ? [] : await dividendCalendars();
    const selected = options.catalogOnly ? [] : dueCompanies(catalog, state.records, options, now);
    for (const company of selected) {
      if (!sources[company.source] || budgetReached) continue;
      const seedSymbols = new Map();
      for (const seed of seeds) for (const coverage of seed.symbols) {
        if ((coverage.symbol === company.symbol || company.symbol === 'BABA' && coverage.symbol === '9988.HK' ||
            company.source === 'dart' && coverage.symbol.split('.')[0] === company.stockCode) && !seedSymbols.has(coverage.symbol))
          seedSymbols.set(coverage.symbol, { seed, coverage });
      }
      const fallback = seedSymbols.size ? { version: 1, checkedAt: [...seedSymbols.values()].map(row => row.seed.checkedAt).sort().at(-1),
        sourceCheckedAt: [...seedSymbols.values()].map(row => row.coverage.checkedAt).filter(Boolean).sort()[0] ?? null,
        symbols: [...seedSymbols.values()].map(row => row.coverage),
        events: [...seedSymbols].flatMap(([symbol, row]) => row.seed.events.filter(event => event.symbol === symbol)) } : null;
      const previous = state.records[company.id]?.feed ?? fallback;
      let feed;
      try { feed = acceptCompanyFeed(previous, await collectCompany(company, previous, { sources, calendars, now })); }
      catch (error) { feed = failedFeed(previous, company, now, error.message); }
      state.records[company.id] = { attemptedAt: now, feed, issue: feed.issue ?? feed.symbols.find(row => row.reason)?.reason ?? null };
      // Every finished company is a checkpoint: interruption never restarts the universe.
      await atomicJson(statePath, state);
      console.log(JSON.stringify({ company: company.symbol ?? company.stockCode, events: feed.events.length,
        status: feed.symbols.length ? feed.symbols.map(row => row.status) : ['mapping-unverified'], reason: state.records[company.id].issue }));
    }
    const manifest = await publishCommonDividends(resolve(root, 'public/data/dividends'), state.records, seeds, catalog, now);
    const summary = { directoryCount: catalog.length, attemptedCompanies: manifest.attemptedCompanies, publishedSymbols: Object.keys(manifest.symbols).length,
      events: Object.values(state.records).reduce((sum, row) => sum + row.feed.events.length, 0), networkRequests: requests, budgetReached, issues };
    console.log(JSON.stringify(summary));
    if (issues.length || budgetReached || selected.some(company => state.records[company.id]?.feed.issue || state.records[company.id]?.feed.symbols.some(row => row.status === 'failed'))) process.exitCode = 1;
    return summary;
  } finally { await unlock(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareCommonDividends(parseCommonArgs(process.argv.slice(2))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
