import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as pause } from 'node:timers/promises';
import { build } from 'esbuild';
import { atomicJson, collectionLock, createSourceCache } from './guru-source-cache.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
export function createKodexClient({ request = fetch, wait = pause, now = Date.now } = {}) {
  let last = -Infinity, count = 0;
  return async url => {
    const target = new URL(url);
    const approved = target.protocol === 'https:' && target.hostname === 'www.samsungfund.com' && !target.port && !target.username && !target.password && !target.hash &&
      (target.href === 'https://www.samsungfund.com/api/v1/kodex/divid-info.do?id=2ETFJ8' ||
       target.href === 'https://www.samsungfund.com/api/v1/kodex/product/2ETFJ8.do' ||
       target.pathname === '/etf/lounge/notice-ajax.do' && [...target.searchParams.keys()].every(key => ['category','searchText','pageNo'].includes(key)) &&
         target.searchParams.get('category') === 'DIVIDEND' && target.searchParams.get('searchText') === '26.' && /^[1-5]$/.test(target.searchParams.get('pageNo') ?? '') ||
       target.pathname === '/etf/lounge/notice-view.do' && [...target.searchParams.keys()].join(',') === 'no' && /^\d+$/.test(target.searchParams.get('no') ?? ''));
    if (!approved) throw Error('Kodex source URL rejected');
    if (++count > 20) throw Error('Kodex collection request limit');
    await wait(Math.max(0, 1000 - (now() - last))); last = now();
    const response = await request(target.href, { redirect: 'error', signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw Error(`Kodex HTTP ${response.status}`);
    const maximum = 2 * 1024 * 1024;
    if (Number(response.headers.get('content-length')) > maximum || !response.body) { await response.body?.cancel(); throw Error('Kodex source size invalid'); }
    const reader = response.body.getReader(), chunks = []; let length = 0;
    try { while (true) { const {done,value} = await reader.read(); if (done) break; length += value.length; if (length > maximum) throw Error('Kodex source too large'); chunks.push(value); } }
    finally { await reader.cancel(); }
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  };
}

async function model() {
  const bundle = await build({ stdin: { contents: 'export * from "./src/features/dividends/etf.ts"; export { calendars } from "./src/features/market/schedule/calendars.ts";', resolveDir: root }, bundle: true, write: false, platform: 'node', format: 'esm' });
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
}

export async function collectKodexDividends(source, previous = null, now = () => new Date().toISOString()) {
  const m = await model();
  const fetched = [];
  const get = async url => { const item = await source.get(url, { ttl: 6 * 3600_000 }); fetched.push(item.fetchedAt); return item.text; };
  const product = JSON.parse(await get(m.kodexProductSource));
  const distributions = JSON.parse(await get(m.kodexDividendSource));
  const notices = []; let complete = false;
  for (let page = 1; page <= 5; page++) {
    const parsed = m.parseKodexNotices(await get(`https://www.samsungfund.com/etf/lounge/notice-ajax.do?category=DIVIDEND&searchText=26.&pageNo=${page}`));
    notices.push(...parsed.notices);
    if (parsed.count < 10) { complete = true; break; }
  }
  if (!complete) throw Error('Kodex notice pagination not complete');
  const checkedAt = now();
  const prepared = m.prepareKodexDividends(distributions, product, notices, m.calendars.find(row => row.id === 'KR'), checkedAt, previous);
  for (const event of prepared.events) m.verifyKodexNotice(await get(event.sourceUrl), event.amountPerShare);
  const sourceCheckedAt = new Date(Math.min(...fetched)).toISOString();
  return { ...prepared, sourceCheckedAt, symbols: prepared.symbols.map(row => ({ ...row, checkedAt: sourceCheckedAt })) };
}

async function main() {
  const storage = resolve(root, 'work/dividends/kodex-sources'); await mkdir(storage, {recursive:true});
  const release = await collectionLock(resolve(root, 'work/dividends/kodex.lock'));
  try {
    const destination = resolve(root, 'src/features/dividends/prepared-etf.json');
    let previous = null;
    try { previous = JSON.parse(await readFile(destination, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const source = createSourceCache(storage, createKodexClient());
    const feed = await collectKodexDividends(source, previous);
    await atomicJson(destination, feed);
    console.log(JSON.stringify({ events: feed.events.length, symbols: feed.symbols.map(row => row.symbol), through: feed.symbols[0].through, checkedAt: feed.sourceCheckedAt, scope: 'local-only; production-reuse-not-approved' }));
  } finally { await release(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
