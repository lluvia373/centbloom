import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescript } from './load-typescript.mjs';
const { createRequestCache } = loadTypescript('src/shared/async/request-cache.ts');
class MarketError extends Error {}
const validDate = date => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
const provider = () => ({ MarketError, validDate, providerRequests: createRequestCache({ concurrency: 2 }) });
const parsers = loadTypescript('src/features/market/server/fx-reference-release.ts', { './provider': provider() });
const url = 'https://mid.ecb.europa.eu/rel/8f51f68db36811f19422ffbbb6def211.xml';
const published = 'Mon, 21 Sep 2026 15:55:08 +0200';
const item = (date = published, link = url) => `<item><title>Euro foreign exchange reference rates</title><link>${link}</link><pubDate>${date}</pubDate></item>`;
const rss = (...items) => `<rss version="2.0"><channel>${items.join('')}</channel></rss>`;
const body = (date = '21 September 2026', stamp = '2026-09-21T15:55:08', rates = '<fx:currency code="USD" desc="US Dollar" rate="1.1"/><fx:currency code="CNY" rate="7"/><fx:currency code="KRW" rate="1400"/>') => `
  <escb:externalMessage xmlns:escb="http://escb.ecb.int/MarketInformationDissemination">
  <escb:header><escb:releaseType>EuroForeignExchangeReferenceRates</escb:releaseType><escb:releaseDateTime>${stamp}</escb:releaseDateTime></escb:header>
  <escb:body><escb:content><fx:eurofxref refcur="EUR" refamt="1" xmlns:fx="http://escb.ecb.int/eurofxref">
  <fx:dailyrates id="${date}">${rates}</fx:dailyrates></fx:eurofxref></escb:content></escb:body></escb:externalMessage>`;

test('MID keeps actual offset-bearing publication separate from reference date and observed price time', () => {
  const [link] = parsers.parseEcbReleaseFeed(rss(item()));
  assert.equal(link.publishedAt, '2026-09-21T13:55:08.000Z');
  assert.equal(link.localPublishedAt, '2026-09-21T15:55:08');
  const release = parsers.parseEcbRelease(body(), link);
  assert.equal(release.date, '2026-09-21'); assert.equal(release.rates.KRW / release.rates.CNY, 200);
  const reference = loadTypescript('src/features/market/server/fx-reference.ts', { './provider': provider() });
  const result = reference.selectEcbBaseline('CNYKRW=X', '2026-09-22', [release]);
  assert.equal(result.price, 200); assert.equal(result.fx.publishedAt, link.publishedAt);
  assert.equal(result.sourceAt, null); assert.equal(result.sourceEndAt, null); assert.equal(result.cutoffLagSeconds, null);
  assert.equal(result.fx.referenceDate, '2026-09-21');
  assert.equal(reference.selectEcbBaseline('CNYKRW=X', '2026-09-21', [release]), null);
  assert.equal(reference.selectEcbBaseline('CNHKRW=X', '2026-09-22', [release]), null);
});

test('future, delayed or over-a-week publications do not enter an earlier midnight baseline', () => {
  const reference = loadTypescript('src/features/market/server/fx-reference.ts', { './provider': provider() });
  const release = parsers.parseEcbRelease(body(), parsers.parseEcbReleaseFeed(rss(item()))[0]);
  assert.equal(reference.selectEcbBaseline('USDKRW=X', '2026-09-22', [{ ...release, publishedAt: '2026-09-21T15:00:01Z' }]), null);
  assert.equal(reference.selectEcbBaseline('USDKRW=X', '2026-09-30', [release]), null);
  assert.equal(reference.selectEcbBaseline('USDKRW=X', '2026-09-22', [{ ...release, publishedAt: 'invalid' }]), null);
  const history = [{ date: '2026-09-21', rates: release.rates }, { date: '2026-09-18', rates: release.rates }];
  assert.equal(reference.selectEcbBaseline('USDKRW=X', '2026-09-22', history).fx.referenceDate, '2026-09-18');
});

test('MID URL allowlist rejects other hosts, credentials, redirects, ports and query strings', () => {
  for (const bad of [url.replace('https:', 'http:'), url.replace('mid.ecb.europa.eu', 'evil.test'),
    url.replace('mid.ecb.europa.eu', 'mid.ecb.europa.eu.evil.test'), url.replace('https://', 'https://user@'),
    url.replace('/rel/', ':443/rel/'), url + '?next=evil', url.replace('/rel/', '/elsewhere/')])
    assert.equal(parsers.parseEcbReleaseFeed(rss(item(published, bad))).length, 0);
  assert.equal(parsers.parseEcbReleaseFeed(rss(item('Mon, 21 Sep 2026 15:55:08'))).length, 0);
});

test('mismatched release timestamps, foreign namespaces, malformed dates and duplicate/invalid rates fail closed', () => {
  const link = parsers.parseEcbReleaseFeed(rss(item()))[0];
  for (const bad of [body('31 September 2026'), body('22 September 2026'), body(undefined, '2026-09-21T16:55:08'),
    body().replace('refcur="EUR"', 'refcur="USD"'), body().replace('http://escb.ecb.int/eurofxref', 'https://evil.test'),
    body().replace('rate="1400"', 'rate="0"'), body().replace('rate="1400"', 'rate="Infinity"'),
    body().replace('code="KRW"', 'code="USD"'), body().replace('code="KRW"', 'code="KRW" code="USD"'),
    '<!DOCTYPE evil>' + body(), body().replace('<fx:currency code="CNY" rate="7"/>', '<error/>')])
    assert.throws(() => parsers.parseEcbRelease(bad, link));
  assert.throws(() => parsers.parseEcbReleaseFeed('<!ENTITY evil>' + rss(item())));
});

test('release queries deduplicate leaves, filter future publications and retain bounded cache/cancellation', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  const calls = [];
  globalThis.fetch = async (request, init) => {
    calls.push({ request, init });
    return { ok: true, text: async () => request === parsers.ECB_RELEASE_FEED
      ? rss(item('Tue, 22 Sep 2026 15:55:08 +0200', url.replace('8f51', '8f52')), item()) : body() };
  };
  const mod = loadTypescript('src/features/market/server/fx-reference-release.ts', { './provider': provider() });
  const results = await Promise.all(Array.from({ length: 4 }, () => mod.fetchEcbReleases(Date.parse('2026-09-21T15:00:00Z'))));
  assert.ok(results.every(r => r.length === 1 && r[0].date === '2026-09-21'));
  assert.equal(calls.length, 2);
  assert.ok(calls.every(c => c.init.cache === 'no-store' && c.init.redirect === 'error' && c.init.signal));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(mod.fetchEcbReleases(Date.parse('2026-09-21T15:00:00Z'), controller.signal), { name: 'AbortError' });
  assert.equal(calls.length, 2);
});

test('verified Monday MID release wins without requesting un-timestamped history', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  const calls = [];
  globalThis.fetch = async (request) => {
    calls.push(request);
    return { ok: true, text: async () => request === parsers.ECB_RELEASE_FEED ? rss(item()) : body() };
  };
  const mod = loadTypescript('src/features/market/server/fx-reference.ts', { './provider': provider() });
  const result = await mod.fetchEcbBaseline('CNYKRW=X', '2026-09-22');
  assert.equal(result.price, 200); assert.equal(result.fx.referenceDate, '2026-09-21');
  assert.equal(calls.length, 2); assert.ok(!calls.includes(mod.ECB_REFERENCE_URL));
});

test('MID failure still uses conservative history; caller cancellation never starts history fallback', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  const calls = [];
  globalThis.fetch = async request => {
    calls.push(request);
    if (request === parsers.ECB_RELEASE_FEED) throw new Error('unavailable');
    return { ok: true, text: async () => '<Envelope xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref"><Cube><Cube time="2026-09-18"><Cube currency="USD" rate="1.1"/><Cube currency="KRW" rate="1400"/></Cube></Cube></Envelope>' };
  };
  const mod = loadTypescript('src/features/market/server/fx-reference.ts', { './provider': provider() });
  const result = await mod.fetchEcbBaseline('USDKRW=X', '2026-09-22');
  assert.equal(result.fx.referenceDate, '2026-09-18'); assert.equal(result.fx.publishedAt, undefined); assert.equal(result.sourceEndAt, null);
  assert.equal(calls.length, 2);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(mod.fetchEcbBaseline('USDKRW=X', '2026-09-22', controller.signal), { name: 'AbortError' });
  assert.equal(calls.length, 2);
});
