// Node 24+. Public-company collection only; never accepts a user's transactions.
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as pause } from 'node:timers/promises';
import { unzipSync } from 'fflate';
import { atomicJson, collectionLock, createSourceCache } from './guru-source-cache.mjs';
import { parseDartDividend, prepareDartSnapshot, validDartDate } from '../src/features/dividends/dart.ts';
import { koreanDividendCompanies, prepareKoreanEvents } from '../src/features/dividends/korea.ts';

const origin = 'https://opendart.fss.or.kr';
const maximum = 8 * 1024 * 1024;
const root = fileURLToPath(new URL('../', import.meta.url));

export function decodeDartDocument(bytes, expandedLimit = maximum) {
  if (bytes.length > maximum || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw Error('DART document is not a ZIP archive');
  let total = 0, count = 0;
  const files = unzipSync(bytes, { filter: file => {
    if (!/\.(?:xml|html?)$/i.test(file.name)) return false;
    total += file.originalSize;
    if (++count > 12 || !Number.isSafeInteger(total) || total > expandedLimit) throw Error('DART expanded document too large');
    return true;
  } });
  const texts = Object.values(files).map(value => {
    // Open DART can return UTF-8 bytes with a legacy EUC-KR HTML meta tag.
    // Decode validated UTF-8 first; only use the declared legacy encoding otherwise.
    try { return new TextDecoder('utf-8', { fatal: true }).decode(value); }
    catch { /* A genuine legacy document still needs its declared encoding. */ }
    const head = new TextDecoder('ascii').decode(value.subarray(0, 500));
    if (!/(?:euc-kr|ks_c_5601|cp949)/i.test(head)) throw Error('DART document encoding is invalid');
    return new TextDecoder('euc-kr', { fatal: true }).decode(value);
  });
  if (!texts.length) throw Error('DART archive has no document');
  return texts.join('\n');
}

export function createDartClient(key, { request = fetch, wait = pause, now = Date.now } = {}) {
  if (!/^[a-f\d]{40}$/i.test(key ?? '')) throw Error('OPEN_DART_API_KEY is required (40 characters).');
  let last = -Infinity, calls = 0;
  return async rawUrl => {
    const url = new URL(rawUrl);
    const allowed = url.pathname === '/api/list.json' ? ['corp_code','bgn_de','end_de','page_no','page_count','last_reprt_at','sort','sort_mth','pblntf_ty']
      : url.pathname === '/api/document.xml' ? ['rcept_no'] : url.pathname === '/api/company.json' ? ['corp_code'] : [];
    if (url.origin !== origin || (!allowed.length && url.pathname !== '/api/corpCode.xml') || url.username || url.password || url.hash ||
        [...url.searchParams.keys()].some(name => !allowed.includes(name))) throw Error('DART URL rejected');
    if (++calls > 2000) throw Error('DART per-run request budget reached');
    await wait(Math.max(0, 1000 - (now() - last))); last = now();
    url.searchParams.set('crtfc_key', key);
    let response;
    try { response = await request(url, { redirect: 'error', signal: AbortSignal.timeout(20_000) }); }
    catch { throw Error('DART network request failed'); } // Never log credential-bearing URLs.
    if (!response.ok) { await response.body?.cancel(); throw Error(`DART HTTP ${response.status}`); }
    if (!response.body || Number(response.headers.get('content-length')) > maximum) {
      await response.body?.cancel(); throw Error('DART response missing or too large');
    }
    const reader = response.body.getReader(), chunks = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.length; if (size > maximum) throw Error('DART response too large'); chunks.push(value);
      }
    } finally { await reader.cancel(); }
    const bytes = Buffer.concat(chunks);
    if (['/api/document.xml', '/api/corpCode.xml'].includes(url.pathname)) {
      if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
        const code = /<status>(\d{3})<\/status>/.exec(bytes.toString('utf8'))?.[1];
        throw Error(`DART document status ${code ?? 'invalid'}`);
      }
      return decodeDartDocument(bytes, url.pathname === '/api/corpCode.xml' ? 64 * 1024 * 1024 : maximum);
    }
    let data;
    try { data = JSON.parse(bytes.toString('utf8')); } catch { throw Error('DART list is not JSON'); }
    if (!['000','013'].includes(data.status)) throw Error(`DART list status ${/^\d{3}$/.test(data.status) ? data.status : 'invalid'}`);
    return JSON.stringify(data);
  };
}

export async function collectDartDividends({ source, previous = null, corpCode, stockCode, from = '2026-01-01', through, now = () => new Date().toISOString() }) {
  if (!validDartDate(from) || !validDartDate(through) || from > through) throw Error('Invalid DART date window');
  if (corpCode !== undefined && (!/^\d{8}$/.test(corpCode) || !/^[A-Z0-9]{6}$/.test(stockCode ?? ''))) throw Error('Invalid DART company scope');
  const filings = [], seen = new Set();
  // An unscoped Open DART list query is limited to three months. Use monthly windows.
  for (let start = from; start <= through;) {
    const nextMonth = new Date(`${start.slice(0,7)}-01T00:00:00Z`);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    const end = new Date(nextMonth.getTime() - 86400000).toISOString().slice(0,10);
    const stop = corpCode ? through : end < through ? end : through;
    let expectedTotal = null, pages = 1, received = 0;
    for (let page = 1; page <= pages; page++) {
      const params = new URLSearchParams({bgn_de:start.replaceAll('-',''),end_de:stop.replaceAll('-',''),page_no:String(page),page_count:'100',last_reprt_at:'N',sort:'date',sort_mth:'asc',pblntf_ty:'I'});
      if (corpCode) params.set('corp_code',corpCode);
      const data = JSON.parse((await source.get(`${origin}/api/list.json?${params}`, { ttl: 0 })).text);
      if (data.status === '013' && page === 1) break;
      if (data.status !== '000' || !Array.isArray(data.list) || !Number.isInteger(data.total_count) ||
          !Number.isInteger(data.total_page) || data.total_page < 1 || data.total_page > 500 ||
          Number(data.page_no) !== page || (expectedTotal !== null && data.total_count !== expectedTotal))
        throw Error('Incomplete or changing DART pagination');
      expectedTotal = data.total_count; pages = data.total_page; received += data.list.length;
      for (const filing of data.list) {
        if (!/^\d{14}$/.test(filing.rcept_no) || seen.has(filing.rcept_no) || !/^\d{8}$/.test(filing.rcept_dt) ||
            filing.rcept_dt < start.replaceAll('-','') || filing.rcept_dt > stop.replaceAll('-','')) throw Error('Invalid or duplicate DART list row');
        seen.add(filing.rcept_no);
        if (corpCode && (filing.corp_code !== corpCode || filing.stock_code !== stockCode)) throw Error('DART company mapping changed');
        if (typeof filing.report_nm !== 'string') throw Error('Missing DART report name');
        if (corpCode && /주식분할|주식병합|감자결정|회사분할결정|회사합병결정/.test(filing.report_nm))
          throw Error('Corporate action requires dividend share-basis review');
        if (filing.report_nm.replace(/\s+/g,'').includes('현금ㆍ현물배당결정') && ['Y','K'].includes(filing.corp_cls)) filings.push(filing);
      }
    }
    if (expectedTotal !== null && received !== expectedTotal) throw Error('DART list rows missing');
    start = new Date(Date.parse(`${stop}T00:00:00Z`) + 86400000).toISOString().slice(0,10);
  }
  const candidates = [];
  for (const filing of filings) {
    const document = await source.get(`${origin}/api/document.xml?rcept_no=${filing.rcept_no}`, { ttl: 24 * 60 * 60_000 });
    candidates.push(parseDartDividend(document.text, filing));
  }
  // The snapshot is staging, not a fabricated complete list of payable dividends.
  return prepareDartSnapshot(candidates, previous, now(), from, through);
}

/** Each company is independent: one failed/partial source must not erase another company's good data. */
export async function collectKoreanDividendFeed({ source, calendar, previous = null, companies = koreanDividendCompanies,
  from = '2026-01-01', through, now = () => new Date().toISOString() }) {
  const events = [], symbols = [], snapshots = {}, checkedAt = now();
  for (const company of companies) {
    const previousCoverage = previous?.symbols?.find(item => item.symbol === company.symbol);
    const previousEvents = previous?.events?.filter(item => item.symbol === company.symbol) ?? [];
    try {
      let oldestObservation = Infinity;
      const observedSource = { get: async (...args) => {
        const response = await source.get(...args);
        if (!Number.isFinite(response.fetchedAt)) throw Error('DART source observation time missing');
        oldestObservation = Math.min(oldestObservation, response.fetchedAt);
        return response;
      } };
      const profile = JSON.parse((await observedSource.get(`${origin}/api/company.json?corp_code=${company.corpCode}`, { ttl: 24 * 60 * 60_000 })).text);
      if (profile.status !== '000' || profile.corp_code !== company.corpCode || profile.stock_code !== company.stockCode || !['Y','K'].includes(profile.corp_cls))
        throw Error('DART company profile does not match the reviewed instrument');
      const snapshot = await collectDartDividends({ source: observedSource, previous: previous?.snapshots?.[company.symbol] ?? null,
        corpCode: company.corpCode, stockCode: company.stockCode, from, through, now });
      const nextEvents = prepareKoreanEvents(snapshot, company, calendar);
      for (const oldEvent of previousEvents) {
        const next = nextEvents.find(event => event.id === oldEvent.id);
        if (!next) throw Error('DART previously published dividend is missing');
        const changedFacts = ['amountPerShare','recordDate','paymentDate','declaredDate'].some(key => next[key] !== oldEvent[key]);
        const oldReceipts = oldEvent.revisionReceipts ?? [];
        if (changedFacts && (!oldReceipts.length || !oldReceipts.every(receipt => next.revisionReceipts.includes(receipt)) ||
            !next.revisionReceipts.some(receipt => !oldReceipts.includes(receipt))))
          throw Error('DART published facts changed without a linked correction');
      }
      snapshots[company.symbol] = snapshot;
      events.push(...nextEvents);
      symbols.push({ symbol: company.symbol, status: nextEvents.length ? 'supported' : 'no-announcement', from, through,
        checkedAt: new Date(oldestObservation).toISOString(), sourceUrl: `https://dart.fss.or.kr/dsae001/main.do?selectKey=corp&textCrpNm=${company.stockCode}` });
    } catch (error) {
      // Keep the prior facts and their real observation date; a failure is not a fresh zero-dividend result.
      if (previous?.snapshots?.[company.symbol]) snapshots[company.symbol] = previous.snapshots[company.symbol];
      events.push(...previousEvents);
      symbols.push({ symbol: company.symbol, status: 'failed', from: previousCoverage?.from ?? from,
        through: previousCoverage?.through ?? through, checkedAt: previousCoverage?.checkedAt ?? null,
        reason: error.message });
    }
  }
  return { version: 1, checkedAt, sourceCheckedAt: symbols.map(item => item.checkedAt).filter(Boolean).sort()[0] ?? null,
    events, symbols, snapshots };
}

/** A new checkout has no private collector cache but must retain the checked-in last good facts. */
export async function readPreviousKoreanState(privatePath, publicPath, read = readFile) {
  for (const path of [privatePath, publicPath]) {
    try {
      const previous = JSON.parse(await read(path, 'utf8'));
      if (previous.version !== 1 || !Array.isArray(previous.events) || !Array.isArray(previous.symbols))
        throw Error('Invalid previous Korean dividend state; preserve and inspect it');
      return previous;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return null;
}

async function prepare() {
  const request = createDartClient(process.env.OPEN_DART_API_KEY);
  const storage = resolve(root, 'work/dividends/dart-sources');
  await mkdir(storage, { recursive: true });
  const unlock = await collectionLock(resolve(root, 'work/dividends/dart.lock'));
  try {
    const output = resolve(root, 'work/dividends/dart-korea-state.json');
    const publicOutput = resolve(root, 'src/features/dividends/prepared-korea.json');
    const previous = await readPreviousKoreanState(output, publicOutput);
    // Wait for the documented publication lag; do not label an incomplete current day complete.
    const through = new Date(Date.now() - 86400000).toISOString().slice(0,10);
    // Bundle only the existing pure calendar module in memory; do not duplicate its holiday list.
    const { build } = await import('esbuild');
    const built = await build({ entryPoints: [resolve(root, 'src/features/market/schedule/calendars.ts')], bundle: true,
      write: false, platform: 'node', format: 'esm', logLevel: 'silent' });
    const { calendars } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
    const result = await collectKoreanDividendFeed({ source:createSourceCache(storage,request), calendar: calendars.find(item => item.id === 'KR'), previous, through });
    await atomicJson(output,result);
    const feed = { version: result.version, checkedAt: result.checkedAt, sourceCheckedAt: result.sourceCheckedAt,
      events: result.events, symbols: result.symbols };
    await atomicJson(publicOutput, feed);
    console.log(JSON.stringify({events:result.events.length,through,checkedAt:result.checkedAt,
      symbols:result.symbols.map(({symbol,status,reason})=>({symbol,status,reason}))}));
    if (result.symbols.some(item => item.status === 'failed')) process.exitCode = 1;
  } finally { await unlock(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 2) throw Error('No command arguments supported');
  prepare().catch(error => { console.error(error.message); process.exitCode=1; });
}
