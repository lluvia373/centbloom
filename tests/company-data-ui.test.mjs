import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadTypescript } from './load-typescript.mjs';
import { isCompanySnapshot } from '../src/features/market/company-data.ts';
import { companyFixture } from './fixtures/company-data.mjs';

const { StockCompanyFacts } = loadTypescript('src/features/market/StockCompanyFacts.tsx', { './StockCompanyFacts.module.css': { default: {} } });
const render = (snapshot, asOfDate = '2026-09-24') => renderToStaticMarkup(createElement(StockCompanyFacts, { snapshot, asOfDate }));

test('unconfigured facts have no empty developer panels; missing data is not zero', () => {
  assert.equal(render(null), '');
  const empty = render(companyFixture('empty'));
  assert.match(empty, /확인된 내역이 없습니다/); assert.doesNotMatch(empty, /무배당|배당 없음|0 USD/);
  const html = render(companyFixture());
  assert.match(html, /통화 미확인/); assert.match(html, /주당이익 0/); assert.match(html, /예상 2/);
  assert.match(html, /2026.10.30/); assert.doesNotMatch(html, /2027.01.30/);
  assert.match(html, /발표 예정/); assert.match(html, /발표 결과/);
  assert.equal((html.match(/rel="noreferrer"/g) ?? []).length, 2);
});

test('failed and empty refreshes explain retained values without claiming no events', () => {
  const snapshot = companyFixture('stale');
  assert.match(render(snapshot), /2026.09.23 확인/);
  assert.match(render(snapshot), /이전 확인 자료/);
  snapshot.datasets.dividends.status = 'empty-unverified';
  const html = render(snapshot);
  assert.match(html, /0.27/); assert.doesNotMatch(html, /확인된 내역이 없습니다/);
});

test('a stale snapshot does not keep a passed earnings date labelled upcoming', () => {
  const html = render(companyFixture('stale'), '2027-02-01');
  assert.doesNotMatch(html, /발표 예정/); assert.match(html, /결과 미확인/);
});

test('documented EPS trading currency never becomes unverified dividend currency', () => {
  const snapshot = companyFixture();
  snapshot.datasets.dividends.rows[0].currency = null;
  snapshot.datasets.earnings.rows.forEach(row => { row.currency = null; });
  snapshot.datasets.profile = { ...snapshot.datasets.earnings, rows: [{ symbol: 'TEST', currency: 'USD' }] };
  assert.match(render(snapshot), /예상 2.1 · USD/);
  assert.match(render(snapshot).split('실적 발표 내역')[0], /통화 미확인/);
  snapshot.datasets.profile.status = 'failed';
  assert.doesNotMatch(render(snapshot), /예상 2.1 · USD/);
});

test('malformed files, missing row fields and another symbol are rejected', () => {
  assert.equal(isCompanySnapshot(companyFixture(), 'TEST'), true);
  for (const mutate of [s => { s.datasets.earnings.receivedAt = 123; }, s => { delete s.datasets.earnings.rows[0].epsActual; },
    s => { s.datasets.dividends.rows[0].amount = Infinity; }, s => { s.datasets.dividends.rows[0].date = '2026-02-30'; },
    s => { s.datasets.dividends.rows.push(s.datasets.dividends.rows[0]); }, s => { s.datasets.dividends.rows[0].symbol = 'OTHER'; }]) {
    const value = companyFixture(); mutate(value); assert.equal(isCompanySnapshot(value, 'TEST'), false);
  }
  assert.equal(isCompanySnapshot(companyFixture(), 'OTHER'), false);
});

test('prepared reader is local-only, rejects corrupt content and never calls a provider', async () => {
  const result = await build({ entryPoints: ['src/features/market/server/prepared-company.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
  const { readPreparedCompany } = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].contents).toString('base64'));
  const directory = await mkdtemp(join(tmpdir(), 'centbloom-company-reader-'));
  await mkdir(join(directory, 'work/company-data/fmp'), { recursive: true });
  const path = join(directory, 'work/company-data/fmp/TEST.json');
  await writeFile(path, JSON.stringify(companyFixture()));
  const cwd = process.cwd(), mode = process.env.NODE_ENV, enabled = process.env.FMP_EVALUATION_ENABLED, fetch = globalThis.fetch;
  try {
    process.chdir(directory); globalThis.fetch = () => { throw Error('A page must not fetch the provider'); };
    process.env.FMP_EVALUATION_ENABLED = 'true'; process.env.NODE_ENV = 'production';
    assert.equal(await readPreparedCompany('TEST'), null);
    process.env.NODE_ENV = 'development'; process.env.FMP_EVALUATION_ENABLED = 'false';
    assert.equal(await readPreparedCompany('TEST'), null);
    process.env.FMP_EVALUATION_ENABLED = 'true';
    assert.equal((await readPreparedCompany('TEST')).symbol, 'TEST');
    assert.equal(await readPreparedCompany('../TEST'), null);
    await writeFile(path, '{}'); assert.equal(await readPreparedCompany('TEST'), null);
  } finally {
    process.chdir(cwd); globalThis.fetch = fetch;
    if (mode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = mode;
    if (enabled === undefined) delete process.env.FMP_EVALUATION_ENABLED; else process.env.FMP_EVALUATION_ENABLED = enabled;
  }
});
