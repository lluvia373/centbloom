// Public issuer data only; never receives an account, a holding, or transaction quantities.
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { atomicJson, collectionLock, createSecClient, createSourceCache } from './guru-source-cache.mjs';
import { foreignIssuers, parseForeignDividends, dividendDocumentText, ordinaryExDate, validForeignDate } from '../src/features/dividends/foreign.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const from = '2026-01-01';
const policy = 'https://www.sec.gov/about/webmaster-frequently-asked-questions';
const rights = 'https://www.investor.gov/introduction-investing/investing-basics/glossary/ex-dividend-dates-when-are-you-entitled-stock-and';

export async function dividendCalendars() {
  const bundled = await build({ stdin: { contents: `export { calendars } from './src/features/market/schedule/calendars';`, resolveDir: root }, bundle: true, write: false, platform: 'node', format: 'esm' });
  return (await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'))).calendars;
}

export function filingRows(submission, issuer, through) {
  if (Number(submission.cik) !== issuer.cik || !submission.tickers?.some(ticker => ticker.replaceAll('.', '-') === issuer.symbol)) throw Error('SEC issuer mapping changed');
  const columns = submission.filings?.recent;
  if (!Array.isArray(columns?.form) || ['filingDate', 'accessionNumber', 'primaryDocument'].some(key => !Array.isArray(columns[key]) || columns[key].length !== columns.form.length)) throw Error('Incomplete SEC filing columns');
  if (!columns.filingDate.some(date => date < from)) throw Error('Recent SEC history does not cover the requested year');
  return columns.form.flatMap((form, i) => {
    const date = columns.filingDate[i];
    // Annual US reports repeat older dividends and can exceed the source size limit;
    // current 8-K announcements and 10-Q declaration tables cover this adapter's year.
    if (date < from || date > through || !/^(8-K|6-K|10-Q|20-F)(\/A)?$/.test(form) && !(form === '10-K' && ['nonpayer', 'discovered'].includes(issuer.kind))) return [];
    const accession = columns.accessionNumber[i], document = columns.primaryDocument[i];
    if (!validForeignDate(date) || !/^\d{10}-\d{2}-\d{6}$/.test(accession) || !/^[\w.-]+\.html?$/.test(document)) throw Error('Invalid SEC filing identity');
    return [{ form, date, base: `https://www.sec.gov/Archives/edgar/data/${issuer.cik}/${accession.replaceAll('-', '')}/`, document }];
  }).sort((a, b) => a.date.localeCompare(b.date));
}

function mergeCandidate(events, candidate) {
  const key = `${candidate.symbol}:${candidate.recordDate}`, old = events.get(key);
  if (old && (old.amountPerShare !== candidate.amountPerShare || old.paymentDate && candidate.paymentDate && old.paymentDate !== candidate.paymentDate)) throw Error('Dividend amendment requires review');
  if (!old || !old.paymentDate && candidate.paymentDate || old.declarationDateBasis === 'filing-date' && candidate.declarationDateBasis === 'issuer-date') events.set(key, candidate);
}

export async function collectForeignDividends({ source, previous = null, calendars, now = new Date().toISOString(), issuers = foreignIssuers, report = () => {} }) {
  if (!Number.isFinite(Date.parse(now)) || previous && previous.checkedAt > now) throw Error('Invalid or older foreign dividend snapshot');
  const through = now.slice(0, 10), allEvents = [], coverage = [];
  for (const issuer of issuers) {
    const symbols = issuer.symbol === 'BABA' ? ['BABA', '9988.HK'] : [issuer.symbol];
    try {
      const submission = await source.get(`https://data.sec.gov/submissions/CIK${String(issuer.cik).padStart(10, '0')}.json`, { ttl: 6 * 3600000 });
      const profile = JSON.parse(submission.text);
      if (issuer.kind === 'discovered' && (profile.tickers?.length !== 1 || !['operating', 'other'].includes(profile.entityType)))
        throw Error('SEC multiple share classes or fund require unit mapping');
      const files = filingRows(profile, issuer, through), candidates = new Map(), checked = [submission.fetchedAt];
      let policyEvidence = null;
      for (const file of files) {
        const primary = await source.get(file.base + file.document, { ttl: 24 * 3600000 });
        const documents = [{ ...primary, url: file.base + file.document }];
        if (/^[86]-K/.test(file.form)) {
          const paths = [...new Set([...primary.text.matchAll(/href="([^"]+)"/gi)].map(m => m[1]).filter(path => /^[\w.-]+\.html?$/i.test(path) && path !== file.document))];
          if (paths.length > 24) throw Error('Unexpected SEC exhibit count');
          for (const path of paths) documents.push({ ...await source.get(file.base + path, { ttl: 24 * 3600000 }), url: file.base + path });
        }
        for (const document of documents) {
          checked.push(document.fetchedAt);
          const text = dividendDocumentText(document.text);
          if (issuer.kind === 'discovered' && /(?:stock split|reverse (?:stock )?split|share consolidation|stock dividend|special (?:cash )?dividend|cancel(?:led|ed)[^.]{0,80}dividend)/i.test(text))
            throw Error('Corporate action or special distribution requires share-basis review');
          for (const candidate of parseForeignDividends(document.text, issuer, document.url, file.date)) {
            if (candidate.recordDate >= from) mergeCandidate(candidates, candidate);
          }
          if (issuer.kind === 'nonpayer') {
            if (/(?:never (?:declared or )?paid|have not (?:declared or )?paid|do not (?:currently )?(?:intend|anticipate|expect) (?:to pay|paying))[^.]{0,100}(?:cash )?dividends[^.]{0,100}(?:our|ordinary|common|foreseeable)/i.test(text)) policyEvidence = { sourceUrl: document.url, date: file.date };
            // A new positive declaration must not be silently classified as no dividend.
            if (/(?:board[^.]{0,100}(?:declared|approved)|we (?:have )?declared)[^.]{0,100}(?:cash dividend|dividend of)/i.test(text)) throw Error('New dividend policy needs an issuer adapter');
          }
        }
      }
      if (checked.some(time => !Number.isFinite(time) || time > Date.now() + 1000)) throw Error('Invalid SEC source check time');
      const checkedAt = new Date(Math.min(...checked)).toISOString();
      const events = [...candidates.values()].map(candidate => {
        const hk = candidate.symbol === '9988.HK';
        return { ...candidate, id: `${candidate.symbol}:${candidate.recordDate}`, name: issuer.name,
          currency: 'USD', exDate: ordinaryExDate(candidate.recordDate, hk ? 'HK' : 'US', calendars),
          marketTimeZone: hk ? 'Asia/Hong_Kong' : 'America/New_York', status: 'declared', entitlement: 'ordinary-cash',
          shareBasis: 'transaction-compatible', shareHistoryFrom: hk ? '2019-11-26' : issuer.shareHistoryFrom,
          withholding: null, issuerCountry: issuer.kind === 'us-common' ? 'US' : 'unknown',
          instrument: issuer.symbol === 'BABA' && !hk ? 'adr' : 'ordinary-share', treatyEligible: issuer.kind === 'us-common',
          rightsSourceUrl: hk ? 'https://www.hkex.com.hk/-/media/HKEX-Market/Listing/Rules-and-Guidance/Archive/Other-Guidance-Materials-for-Listed-Issuers/f_div.pdf' : rights,
          factsCheckedUrl: candidate.sourceUrl, rightsCheckedAt: through };
      });
      const oldEvents = previous?.events?.filter(event => symbols.includes(event.symbol)) ?? [];
      if (oldEvents.some(old => !events.some(event => event.id === old.id && event.amountPerShare === old.amountPerShare && event.paymentDate === old.paymentDate))) throw Error('Previously confirmed dividend disappeared or changed');
      if (issuer.kind !== 'nonpayer' && !events.length) throw Error('No complete dividend announcement parsed; this is not evidence of no dividend');
      if (issuer.kind === 'nonpayer' && !policyEvidence) throw Error('No verified dividend policy statement');
      allEvents.push(...events);
      for (const symbol of symbols) coverage.push({ symbol, status: events.some(e => e.symbol === symbol) ? 'supported' : 'no-announcement', from, through, checkedAt,
        ...(issuer.kind === 'discovered' ? { status: 'partial', reason: '일반 보통주 공시에서 확인된 배당만 포함하며 전체 발표 누락 여부는 미확인입니다.' } : {}),
        ...(policyEvidence ? { sourceUrl: policyEvidence.sourceUrl, reason: '회사의 배당 미지급 방침과 이후 SEC 공시를 확인했습니다.' } : {}),
        ...(symbol === 'OXY' && !events.some(event => event.recordDate === '2026-06-10') ? { status: 'partial', reason: '2026년 7월 지급 배당의 날짜 자료를 사용 가능한 공급원에서 확인하지 못했습니다.' } : {}) });
      report({ symbol: issuer.symbol, events: events.length, status: coverage.at(-1).status });
    } catch (error) {
      allEvents.push(...(previous?.events?.filter(event => symbols.includes(event.symbol)) ?? []));
      for (const symbol of symbols) coverage.push({ symbol, status: 'failed', from, through, checkedAt: (previous?.symbols ?? previous?.coverage)?.find(entry => entry.symbol === symbol)?.checkedAt ?? null,
        reason: error.message });
      report({ symbol: issuer.symbol, status: 'failed', reason: error.message });
    }
  }
  return { version: 1, checkedAt: new Date(Math.max(Date.parse(now), ...coverage.map(c => Date.parse(c.checkedAt)).filter(Number.isFinite))).toISOString(), sourceCheckedAt: coverage.map(c => c.checkedAt).filter(Boolean).sort()[0] ?? null,
    sourcePolicyUrl: policy, events: allEvents.sort((a, b) => a.recordDate.localeCompare(b.recordDate) || a.symbol.localeCompare(b.symbol)), symbols: coverage };
}

async function prepare() {
  const storage = resolve(root, 'work/dividends/foreign-sources');
  await mkdir(storage, { recursive: true });
  const unlock = await collectionLock(resolve(root, 'work/dividends/foreign.lock'));
  try {
    const output = resolve(root, 'src/features/dividends/prepared-foreign.json');
    let previous = null;
    try { previous = JSON.parse(await readFile(output, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const source = createSourceCache(storage, createSecClient(process.env.SEC_USER_AGENT));
    const result = await collectForeignDividends({ source, previous, calendars: await dividendCalendars(), report: value => console.log(JSON.stringify(value)) });
    if (!result.events.length) throw Error('No confirmed foreign dividends; preserve prior snapshot');
    await atomicJson(output, result);
    console.log(JSON.stringify({ events: result.events.length, coverage: result.symbols.length, failed: result.symbols.filter(c => c.status === 'failed').length }));
  } finally { await unlock(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepare().catch(error => { console.error(error.message); process.exitCode = 1; });
}
