import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescript } from './load-typescript.mjs';

const { createRequestCache } = loadTypescript('src/shared/async/request-cache.ts');
class MarketError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}
const row = (symbol, price = 100) => ({
  symbol, longName: symbol, currency: 'USD', regularMarketPrice: price,
  regularMarketChange: 2, regularMarketChangePercent: 2.04,
  regularMarketTime: new Date('2026-09-22T20:00:00Z'),
});
function server(handler = symbols => symbols.map(symbol => row(symbol)), now = Date.now) {
  const calls = [];
  const provider = {
    MarketError,
    validSymbol: symbol => /^[A-Za-z0-9.^=_-]{1,40}$/.test(symbol),
    providerRequests: createRequestCache({ concurrency: 4, now }),
    yahoo: { quote: async (symbols, options, { fetchOptions: { signal } }) => {
      calls.push({ symbols, options, signal });
      return handler(symbols, signal);
    } },
  };
  const source = loadTypescript('src/features/market/server/quote-source.ts', { './provider': provider });
  return { calls, provider, ...source, fetchQuotes: source.fetchProviderQuotes, fetchQuote: source.fetchProviderQuote };
}

test('batch symbols normalize and deduplicate, while invalid, empty and FX groups fail before provider work', async () => {
  const s = server();
  assert.deepEqual([...s.quoteBatchSymbols(' aapl ,^gspc,AAPL')], ['AAPL', '^GSPC']);
  for (const input of [null, '', 'AAPL,', 'AAPL,USDJPY=X', 'USDKRW=X', 'KRW=X', 'ABC=X', 'AAPL/secret',
    Array.from({ length: 51 }, (_, i) => `A${i}`).join(',')])
    assert.throws(() => s.quoteBatchSymbols(input), error => error.status === 400);
  await assert.rejects(s.fetchQuotes([]), error => error.status === 400);
  assert.equal(s.calls.length, 0);
  assert.equal(s.quoteBatchSymbols(Array(100).fill('AAPL').join(',')).length, 1);
});

test('one provider array call maps each requested symbol by identity, preserving original values and source time', async () => {
  const s = server(() => [row('^GSPC', 7000), row('UNREQUESTED', 99), row('AAPL', 200)]);
  const result = await s.fetchQuotes(['aapl', '^GSPC', 'AAPL']);
  assert.equal(s.calls.length, 1);
  assert.deepEqual([...s.calls[0].symbols], ['AAPL', '^GSPC']);
  assert.equal(result.quotes.AAPL.price, 200);
  assert.equal(result.quotes['^GSPC'].price, 7000);
  assert.equal(result.quotes.AAPL.symbol, 'AAPL');
  assert.equal(result.quotes.AAPL.quotedAt, '2026-09-22T20:00:00.000Z');
  assert.equal(result.quotes.AAPL.change, 2);
  assert.deepEqual(Object.keys(result.errors), []);
  assert.equal(result.quotes.UNREQUESTED, undefined);
});

test('missing and invalid rows remain individual 404 results and partial failures are not cached', async () => {
  let valid = false;
  const s = server(() => valid ? [row('AAPL'), row('MSFT'), row('^GSPC')]
    : [row('AAPL'), row('MSFT', 0), row('WRONG-SYMBOL')]);
  const partial = await s.fetchQuotes(['AAPL', 'MSFT', '^GSPC']);
  assert.deepEqual(Object.keys(partial.quotes), ['AAPL']);
  assert.equal(partial.errors.MSFT.status, 404);
  assert.equal(partial.errors['^GSPC'].status, 404);
  assert.equal(partial.quotes.MSFT, undefined);
  valid = true;
  assert.equal(Object.keys((await s.fetchQuotes(['AAPL', 'MSFT', '^GSPC'])).quotes).length, 3);
  assert.equal(s.calls.length, 2);
});

test('complete batches share a normalized cache key only within the existing five-second lifetime', async () => {
  let now = 0;
  const s = server(undefined, () => now);
  const [first, second] = await Promise.all([s.fetchQuotes(['MSFT', 'AAPL']), s.fetchQuotes(['aapl', 'msft'])]);
  assert.equal(first, second);
  assert.equal(s.calls.length, 1);
  now = 4999;
  assert.equal(await s.fetchQuotes(['AAPL', 'MSFT']), first);
  now = 5000;
  await s.fetchQuotes(['AAPL', 'MSFT']);
  assert.equal(s.calls.length, 2);
});

test('upstream failure rejects the complete batch, is not cached, and can recover', async () => {
  let fail = true;
  const s = server(symbols => { if (fail) throw new Error('upstream unavailable'); return symbols.map(symbol => row(symbol)); });
  await assert.rejects(s.fetchQuotes(['AAPL']), /upstream unavailable/);
  fail = false;
  assert.equal((await s.fetchQuotes(['AAPL'])).quotes.AAPL.price, 100);
  assert.equal(s.calls.length, 2);
});

test('one abort does not cancel a shared batch, while the final subscriber abort cancels upstream work', async () => {
  let complete;
  const s = server(() => new Promise(resolve => { complete = resolve; }));
  const first = new AbortController(), second = new AbortController();
  const a = s.fetchQuotes(['AAPL'], first.signal), b = s.fetchQuotes(['AAPL'], second.signal);
  await Promise.resolve();
  first.abort();
  await assert.rejects(a, error => error.name === 'AbortError');
  assert.equal(s.calls[0].signal.aborted, false);
  complete([row('AAPL')]);
  assert.equal((await b).quotes.AAPL.price, 100);
  const only = new AbortController();
  const abandoned = s.fetchQuotes(['MSFT'], only.signal);
  await Promise.resolve();
  only.abort();
  await assert.rejects(abandoned, error => error.name === 'AbortError');
  assert.equal(s.calls[1].signal.aborted, true);
});

test('single-symbol requests use the same field normalization and preserve compatible missing-change defaults', async () => {
  const s = server(symbols => {
    const value = row(Array.isArray(symbols) ? symbols[0] : symbols);
    delete value.regularMarketChange;
    delete value.regularMarketChangePercent;
    return Array.isArray(symbols) ? [value] : value;
  });
  const single = await s.fetchQuote(' aapl ');
  const batch = (await s.fetchQuotes(['AAPL'])).quotes.AAPL;
  assert.equal(single.price, batch.price);
  assert.equal(single.name, batch.name);
  assert.equal(single.change, batch.change);
  assert.equal(single.changePercent, 0);
  assert.equal(single.quotedAt, batch.quotedAt);
});

test('batch route validates the complete request and preserves partial 200, upstream 502 and explicit 503', async () => {
  const s = server();
  let calls = 0, failure;
  const route = loadTypescript('src/app/api/quotes/route.ts', {
    'next/server': { NextResponse: { json: (data, options) => ({ data, status: options?.status ?? 200, headers: options?.headers }) } },
    '@/features/market/server/provider': { MarketError },
    '@/features/market/server/http': { marketResponseError: error => ({ status: error instanceof MarketError ? error.status : 502 }) },
    '@/features/market/server/quote': { quoteBatchSymbols: s.quoteBatchSymbols, fetchQuotes: async () => {
      calls++;
      if (failure) throw failure;
      return { quotes: { AAPL: row('AAPL') }, errors: { MISSING: { status: 404, message: 'missing' } } };
    } },
  });
  const get = query => route.GET({ nextUrl: new URL('https://example.test/api/quotes' + query) });
  for (const query of ['', '?symbols=', '?symbols=AAPL&symbols=MSFT', '?symbols=USDKRW%3DX', '?symbols=AAPL%2C'])
    assert.equal((await get(query)).status, 400);
  assert.equal(calls, 0);
  const result = await get('?symbols=AAPL%2CMISSING');
  assert.equal(result.status, 200);
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.equal(result.data.errors.MISSING.status, 404);
  failure = new Error('upstream');
  assert.equal((await get('?symbols=AAPL')).status, 502);
  failure = new MarketError('unavailable', 503);
  assert.equal((await get('?symbols=AAPL')).status, 503);
});

test('server diagnostics classify provider failures without emitting cookies, URLs or raw payloads', () => {
  const logs = [], original = console.warn;
  console.warn = (...values) => logs.push(values);
  try {
    const { marketResponseError } = loadTypescript('src/features/market/server/http.ts', {
      './provider': { MarketError },
      'next/server': { NextResponse: { json: (data, options) => ({ data, status: options.status, headers: options.headers }) } },
    });
    const result = marketResponseError(new Error('Failed to get crumb, status 429, cookie=private-secret https://private.test/?token=secret'));
    assert.equal(result.status, 429);
    assert.equal(result.headers['Retry-After'], '60');
    assert.equal(logs[0][1].reason, 'provider-rate-limit');
    assert.equal(logs[0][1].upstreamStatus, 429);
    marketResponseError(new Error('Cannot perform I/O on behalf of a different request. private-user'));
    assert.equal(logs[1][1].reason, 'worker-request-context');
    assert.doesNotMatch(JSON.stringify(logs), /private|secret|https|cookie/);
    const limited = new Error('provider refused request');
    limited.code = 429;
    limited.retryAfterSeconds = 120;
    limited.providerEndpoint = 'auth';
    const known = marketResponseError(limited);
    assert.equal(known.status, 429);
    assert.equal(known.headers['Retry-After'], '120');
    assert.equal(logs[2][1].providerEndpoint, 'auth');
    const unrelated = marketResponseError(new Error('provider unavailable'));
    assert.equal(unrelated.status, 502);
    assert.equal(unrelated.headers['Retry-After'], undefined);
  } finally { console.warn = original; }
});
