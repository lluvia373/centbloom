import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseSecDirectory, parseDartDirectory, parseCommonArgs, dueCompanies, acceptCompanyFeed, publishCommonDividends } from '../scripts/prepare-common-dividends.mjs';
import { parseForeignDividends } from '../src/features/dividends/foreign.ts';
import { createSecClient, sha256 } from '../scripts/guru-source-cache.mjs';
import { loadTypescript } from './load-typescript.mjs';

const instant = '2026-09-24T12:00:00.000Z';
const base = JSON.parse(readFileSync('src/features/dividends/prepared-foreign.json', 'utf8'));
const apple = { version: 1, checkedAt: base.checkedAt, sourceCheckedAt: base.sourceCheckedAt,
  symbols: base.symbols.filter(row => row.symbol === 'AAPL'), events: base.events.filter(row => row.symbol === 'AAPL') };
const blank = { version: 1, checkedAt: '2026-01-01T00:00:00Z', sourceCheckedAt: null, symbols: [], events: [] };
const { createDividendRepository, parseDividendManifest, parseCompanyDividendFeed } = loadTypescript('src/features/dividends/repository.ts', { './feed': { dividendFeed: blank } });
const { dividendSchedule } = loadTypescript('src/features/dividends/model.ts');
const asObject = value => JSON.parse(JSON.stringify(value));

test('directories discover new companies, preserve share class identity and accept current alphanumeric Korean codes', () => {
  const rows = parseSecDirectory({ fields: ['cik', 'name', 'ticker', 'exchange'], data: [[789019, 'Microsoft', 'MSFT', 'Nasdaq'], [1, 'Class B', 'TEST.B', null]] });
  assert.deepEqual(rows.map(row => row.symbol), ['MSFT', 'TEST-B']);
  assert.throws(() => parseSecDirectory({ fields: ['cik', 'name', 'ticker', 'exchange'], data: [[1, 'A', 'TEST.B', null], [2, 'B', 'TEST-B', null]] }), /Ambiguous/);
  const xml = '<result><list><corp_code>00164779</corp_code><corp_name>SK</corp_name><stock_code>000660</stock_code></list><list><corp_code>01933981</corp_code><corp_name>BNK</corp_name><stock_code>0068Y0</stock_code></list><list><corp_code>00000001</corp_code><corp_name>Private</corp_name><stock_code> </stock_code></list></result>';
  assert.deepEqual(parseDartDirectory(xml).map(row => row.stockCode), ['000660', '0068Y0']);
  assert.throws(() => parseDartDirectory('<!DOCTYPE foo>' + xml), /Invalid/);
});

test('bounded batches resume across the full directory; explicit symbols cannot create arbitrary companies', () => {
  const catalog = Array.from({ length: 100 }, (_, i) => ({ id: `sec:${i}:S${i}`, source: 'sec', symbol: `S${i}` }));
  const options = parseCommonArgs(['--limit=30']);
  assert.equal(parseCommonArgs([]).limit, Infinity, 'no supported-company count cap');
  const first = dueCompanies(catalog, {}, options, instant);
  const records = Object.fromEntries(first.map(row => [row.id, { attemptedAt: instant }]));
  const next = dueCompanies(catalog, records, options, instant);
  assert.equal(first.length, 30); assert.equal(next.length, 30);
  assert.ok(next.every(row => !records[row.id]));
  assert.throws(() => dueCompanies(catalog, {}, { ...options, only: ['MISSING'] }, instant), /verified/);
  assert.throws(() => parseCommonArgs(['--limit=0']));
});

test('new quarterly events append; silent disappearance, changed amount, duplicate and older snapshot cannot replace good history', () => {
  const current = { ...apple, checkedAt: instant };
  assert.equal(acceptCompanyFeed(apple, current).events.length, 3);
  assert.throws(() => acceptCompanyFeed(apple, { ...current, events: [] }), /disappeared/);
  assert.throws(() => acceptCompanyFeed(apple, { ...current, events: current.events.map((row, i) => i ? row : { ...row, amountPerShare: 99 }) }), /correction/);
  assert.throws(() => acceptCompanyFeed(apple, { ...current, events: [...current.events, current.events[0]] }), /Duplicate/);
  assert.throws(() => acceptCompanyFeed(apple, { ...current, checkedAt: '2025-01-01' }), /regressing/);
  const newEvent = { ...current.events.at(-1), id: 'new-quarter', recordDate: '2026-11-09' };
  assert.equal(acceptCompanyFeed(apple, { ...current, events: [...current.events, newEvent] }).events.length, 4);
});

test('generic parser works without a company-name adapter; rejects preferred/ADR/special/class ambiguity and annual total', () => {
  const issuer = { symbol: 'NEW', cik: 123, kind: 'discovered', name: 'New company', shareHistoryFrom: '2026-01-01' };
  const url = 'https://www.sec.gov/Archives/edgar/data/123/000000012326000001/ex99.htm';
  const sentence = 'The board declared a quarterly cash dividend of $0.91 per common share. The dividend is payable on June 11, 2026 to shareholders of record as of the close of business on May 21, 2026.';
  const parsed = parseForeignDividends(sentence, issuer, url, '2026-03-10');
  assert.equal(parsed[0].amountPerShare, .91); assert.equal(parsed[0].recordDate, '2026-05-21');
  for (const replacement of ['preferred share', 'ADS', 'Class A common share'])
    assert.equal(parseForeignDividends(sentence.replace('common share', replacement), issuer, url, '2026-03-10').length, 0);
  const table = '<p>Cash dividends declared per common share $2.73</p><p>Our Board of Directors declared the following dividends:</p><table>Declaration Date Record Date Payment Date Dividend Per Share Amount March 10, 2026 May 21, 2026 June 11, 2026 $ 0.91 $ 6,760 Total $2.73 $20,278</table>';
  const result = parseForeignDividends(table, issuer, url, '2026-04-29');
  assert.equal(result.length, 1); assert.equal(result[0].amountPerShare, .91);
});

test('SEC client permits only the official directory endpoint, not arbitrary URLs', async () => {
  const seen = [];
  const client = createSecClient('Centbloom test@example.com', { wait: async () => {}, request: async url => { seen.push(url); return new Response('{}'); } });
  await client('https://www.sec.gov/files/company_tickers_exchange.json');
  await assert.rejects(client('https://www.sec.gov/files/unrelated.json'), /rejected/);
  assert.equal(seen.length, 1);
});

test('shared storage publishes immutable symbol facts and preserves seeds on partial company work', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'centbloom-dividend-store-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const manifest = await publishCommonDividends(directory, {}, [apple], Array.from({ length: 100 }), instant);
  assert.equal(manifest.directoryCount, 100); assert.equal(manifest.attemptedCompanies, 0);
  assert.deepEqual(Object.keys(manifest.symbols), ['AAPL']);
  const path = manifest.symbols.AAPL.path.split('/').at(-1);
  const data = JSON.parse(await readFile(join(directory, path), 'utf8'));
  assert.equal(path, `${sha256(JSON.stringify(data))}.json`);
  assert.equal(data.events.length, 3);
  assert.ok(!/portfolioId|userId|quantity/.test(JSON.stringify(data)));
  assert.deepEqual(JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')), manifest);
  const restored = await publishCommonDividends(directory, {}, [], Array.from({ length: 101 }), instant);
  assert.equal(restored.symbols.AAPL.path, manifest.symbols.AAPL.path, 'fresh checkout with no private state retains published company facts');
});

function repositoryHarness(feed = apple) {
  const path = `/data/dividends/${sha256(JSON.stringify(feed))}.json`, calls = [];
  let time = Date.parse(instant), error = false;
  const manifest = { version: 1, generatedAt: instant, symbols: { AAPL: { path, status: feed.symbols[0].status } } };
  const repository = createDividendRepository(blank, async (url, options) => {
    calls.push({ url, credentials: options.credentials });
    if (error) return new Response('{}', { status: 503 });
    return new Response(JSON.stringify(url.endsWith('manifest.json') ? manifest : feed));
  }, () => time);
  return { repository, calls, fail: () => { error = true; time += 300001; } };
}

test('two consumers share one public request; warm portfolio/account switches fetch nothing and never share quantities', async () => {
  const { repository, calls } = repositoryHarness();
  await Promise.all([repository.load(['AAPL']), repository.load(['AAPL'])]);
  await repository.load(['AAPL']);
  assert.equal(calls.length, 2); assert.ok(calls.every(call => call.credentials === 'omit'));
  const tx = quantity => ({ id: '1', portfolioId: 'account-local', symbol: 'AAPL', name: 'Apple', type: 'buy', date: '2026-01-02', price: 100, currency: 'USD', fee: 0, quantity });
  const a = dividendSchedule([tx(10)], repository.getSnapshot(), '2026-09-24', 'all');
  const b = dividendSchedule([tx(20)], repository.getSnapshot(), '2026-09-24', 'all');
  assert.equal(b.rows[0].estimate.grossAmount, a.rows[0].estimate.grossAmount * 2);
  assert.equal(dividendSchedule([], repository.getSnapshot(), '2026-09-24', 'all').rows.length, 0);
  assert.deepEqual(asObject(repository.getSnapshot().events), apple.events);
});

test('network failure preserves source timestamps; bad paths, mixed symbols and a no-dividend lie are rejected', async () => {
  const { repository, fail } = repositoryHarness();
  await repository.load(['AAPL']); const before = repository.getSnapshot();
  fail(); await assert.rejects(repository.load(['AAPL']), /unavailable/);
  assert.equal(repository.getSnapshot(), before);
  assert.throws(() => parseDividendManifest({ version: 1, generatedAt: instant, symbols: { AAPL: { path: 'https://evil.example/a.json', status: 'supported' } } }), /path/);
  assert.throws(() => parseCompanyDividendFeed(apple, 'MSFT'), /feed/);
  const entry = { path: `/data/dividends/${sha256(JSON.stringify(apple))}.json`, status: 'supported' };
  assert.throws(() => parseDividendManifest({ version: 1, generatedAt: instant, symbols: { AAPL: entry, MSFT: entry } }), /path/);
  assert.throws(() => parseCompanyDividendFeed({ ...apple, symbols: [{ ...apple.symbols[0], status: 'no-announcement' }] }, 'AAPL'), /coverage/);
});
