import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescript } from './load-typescript.mjs';

const { createProviderFetch } = loadTypescript('src/features/market/server/provider-fetch.ts');
const quoteUrl = 'https://query2.finance.yahoo.com/v7/finance/quote?symbols=AAPL';
const limited = seconds => error => error.status === 429 && error.retryAfterSeconds === seconds;

test('a Yahoo 429 preserves Retry-After, releases its body, and prevents more same-path network requests until expiry', async () => {
  let now = 0, calls = 0, released = 0;
  const fetcher = createProviderFetch(async () => {
    calls++;
    if (calls > 1) return new Response('{}');
    return new Response(new ReadableStream({ cancel() { released++; } }), { status: 429, headers: { 'Retry-After': '120' } });
  }, () => now);
  await assert.rejects(fetcher(quoteUrl), error => limited(120)(error) && error.providerEndpoint === 'quote');
  assert.equal(released, 1);
  now = 1000;
  await assert.rejects(fetcher(quoteUrl.replace('AAPL', 'MSFT')), limited(119));
  assert.equal(calls, 1);
  now = 120000;
  assert.equal((await fetcher(quoteUrl)).status, 200);
  assert.equal(calls, 2);
});

test('quote throttling does not block a different Yahoo path or hostname', async () => {
  const calls = [];
  const fetcher = createProviderFetch(async input => {
    calls.push(input);
    return new Response('{}', { status: input === quoteUrl ? 429 : 200 });
  }, () => 0);
  await assert.rejects(fetcher(quoteUrl), limited(60));
  const chart = 'https://query2.finance.yahoo.com/v8/finance/chart/USDKRW=X';
  const other = 'https://example.test/v7/finance/quote?symbols=AAPL';
  assert.equal((await fetcher(chart)).status, 200);
  assert.equal((await fetcher(other)).status, 200);
  assert.equal(calls.length, 3);
});

test('Retry-After dates are honored and absent or invalid headers use the explicit sixty-second policy', async () => {
  const now = Date.parse('2026-09-23T04:00:00Z');
  for (const [header, expected] of [
    ['Wed, 23 Sep 2026 04:02:00 GMT', 120], [null, 60], ['nonsense', 60], ['-5', 60], ['0', 1],
    ['9'.repeat(400), 60],
  ]) {
    const fetcher = createProviderFetch(async () => new Response('', {
      status: 429, headers: header == null ? {} : { 'Retry-After': header },
    }), () => now);
    await assert.rejects(fetcher(quoteUrl), limited(expected));
  }
});

test('non-429 failures and non-Yahoo hosts do not create a shared cooldown', async () => {
  let calls = 0;
  const fetcher = createProviderFetch(async () => { calls++; return new Response('', { status: 503 }); });
  assert.equal((await fetcher(quoteUrl)).status, 503);
  assert.equal((await fetcher(quoteUrl)).status, 503);
  const outside = createProviderFetch(async () => { calls++; return new Response('', { status: 429 }); });
  assert.equal((await outside('https://example.test/path')).status, 429);
  assert.equal((await outside('https://example.test/path')).status, 429);
  assert.equal(calls, 4);
});

test('concurrent already-running responses cannot shorten a longer provider cooldown', async () => {
  let now = 0;
  const pending = [];
  const fetcher = createProviderFetch(() => new Promise(resolve => pending.push(resolve)), () => now);
  const a = fetcher(quoteUrl), b = fetcher(quoteUrl);
  pending[0](new Response('', { status: 429, headers: { 'Retry-After': '120' } }));
  await assert.rejects(a, limited(120));
  now = 1000;
  pending[1](new Response('', { status: 429, headers: { 'Retry-After': '30' } }));
  await assert.rejects(b, limited(119));
  await assert.rejects(fetcher(quoteUrl), limited(119));
  assert.equal(pending.length, 2);
});

test('cooldown memory is bounded across distinct paths, and slow body cleanup cannot lose the response delay', async () => {
  let calls = 0, now = 0;
  const fetcher = createProviderFetch(async () => { calls++; return new Response('', { status: 429 }); }, () => now);
  for (let i = 0; i < 65; i++)
    await assert.rejects(fetcher(`https://query2.finance.yahoo.com/v8/finance/chart/S${i}`), limited(60));
  await assert.rejects(fetcher('https://query2.finance.yahoo.com/v8/finance/chart/S64'), limited(60));
  assert.equal(calls, 65);
  await assert.rejects(fetcher('https://query2.finance.yahoo.com/v8/finance/chart/S0'), limited(60));
  assert.equal(calls, 66);

  const slowCleanup = createProviderFetch(async () => new Response(new ReadableStream({
    cancel() { now += 61000; },
  }), { status: 429 }), () => now);
  await assert.rejects(slowCleanup(quoteUrl), limited(1));
});
