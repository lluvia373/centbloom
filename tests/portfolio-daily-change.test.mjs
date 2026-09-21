import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescript } from './load-typescript.mjs';

const { calculateDailyChange, planDailyChange } = loadTypescript('src/features/portfolio/model/daily-change.ts');
const { buildSummary } = loadTypescript('src/features/portfolio/model/summary.ts');
const { buildHoldingAllocation, getAllocationPage } = loadTypescript('src/features/portfolio/model/holding-allocation.ts');
const DATE = '2026-09-19';
const MIDNIGHT = '2026-09-18T15:00:00.000Z';
const CURRENT = '2026-09-19T02:00:00.000Z';

function transaction(overrides = {}) {
  return {
    id: 'opening', symbol: 'AAPL', name: 'Apple', type: 'buy',
    date: '2026-09-18', quantity: 1, price: 100, fee: 0,
    currency: 'USD', fxRateToKRW: 1300, usdKrwRateAtTransaction: 1300,
    createdAt: '2026-09-18T01:00:00.000Z', ...overrides,
  };
}

function quote(symbol, price, currency = 'USD', overrides = {}) {
  return { symbol, name: symbol, price, currency, change: 0, changePercent: 0,
    quotedAt: symbol.endsWith('=X') ? '2026-09-18T20:59:00.000Z' : CURRENT, fetchedAt: CURRENT, ...overrides };
}

function baseline(symbol, price, currency = 'USD', overrides = {}) {
  return {
    symbol, date: DATE, baselineAt: MIDNIGHT, price, currency,
    status: 'available', precision: 'minute', source: 'yahoo-chart',
    sourceAt: '2026-09-18T14:59:00.000Z', sourceEndAt: MIDNIGHT,
    marketClosed: false, fetchedAt: CURRENT, ...overrides,
  };
}

function calculate(overrides = {}) {
  return calculateDailyChange({
    transactions: [transaction()], date: DATE, displayCurrency: 'KRW',
    quotes: { AAPL: quote('AAPL', 110), 'USDKRW=X': quote('USDKRW=X', 1410, 'KRW') },
    baselines: { AAPL: baseline('AAPL', 100), 'USDKRW=X': baseline('USDKRW=X', 1400, 'KRW') },
    ...overrides,
  });
}

function close(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 1e-7, `${label ?? 'amount'}: expected ${expected}, received ${actual}`);
}

function holding(overrides = {}) {
  return { id: 'AAPL', symbol: 'AAPL', name: 'Apple', quantity: 2,
    avgCost: 100, currency: 'USD', addedAt: '2026-01-01', ...overrides };
}

test('KST midnight price and FX both contribute, independently of previous-close change fields', () => {
  const result = calculate({ transactions: [transaction({ quantity: 10 })] });
  assert.equal(result.available, true);
  close(result.change, 151000);
  close(result.priceImpact, 140000);
  close(result.fxImpact, 11000);
  close(result.bySymbol.AAPL, 151000);
  close(result.priceImpact + result.fxImpact, result.change);
});

test('a reference date reaches only the affected result and position, without an estimate label', () => {
  const reference = baseline('USDKRW=X', 1400, 'KRW', { precision: 'daily-reference', source: 'ecb-reference',
    sourceAt: null, sourceEndAt: null,
    fx: { method: 'ecb-reference', referenceDate: '2026-09-17', components: [] } });
  const result = calculate({ baselines: { AAPL: baseline('AAPL', 100), 'USDKRW=X': reference } });
  assert.equal(result.available, true); assert.equal(result.estimated, true);
  assert.deepEqual(Array.from(result.estimatedSymbols), ['AAPL']);
  assert.ok(result.fxNotes.some(note => note.includes('2026-09-17 ECB 일별 환율 적용')));
  assert.ok(result.fxNotes.every(note => !note.includes('추정')));
  assert.deepEqual(Array.from(result.referenceDates), ['2026-09-17']);
  assert.deepEqual(Array.from(result.referenceDatesBySymbol.AAPL), ['2026-09-17']);
  close(result.change, result.priceImpact + result.fxImpact);
  const dollars = calculate({ displayCurrency: 'USD', baselines: { AAPL: baseline('AAPL', 100), 'USDKRW=X': reference } });
  assert.equal(dollars.estimated, false); assert.equal(dollars.fxNotes.length, 0);
  assert.equal(dollars.referenceDates.length, 0);
});

test('missing midnight and current FX identify which rate failed; stale/future/wrong-currency rates are rejected', () => {
  assert.match(calculate({ baselines: { AAPL: baseline('AAPL', 100) } }).reason, /USD\/KRW 자정 기준 환율/);
  for (const extra of [{ quotedAt: '2026-09-11T20:44:00Z' }, { quotedAt: '2026-09-20T00:00:00Z' }, { currency: 'USD' }]) {
    const result = calculate({ quotes: { AAPL: quote('AAPL', 110), 'USDKRW=X': quote('USDKRW=X', 1410, 'KRW', extra) } });
    assert.equal(result.available, false); assert.match(result.reason, /USD\/KRW 현재 환율/);
  }
});

function mondayInput() {
  const day = { date: '2026-09-21', baselineAt: '2026-09-20T15:00:00Z' };
  const fetchedAt = '2026-09-20T18:00:00Z'; // Monday 03:00 KST, before the FX week reopens.
  return { date: day.date,
    baselines: {
      AAPL: baseline('AAPL', 100, 'USD', { ...day, precision: 'session-close', marketClosed: true,
        sourceAt: '2026-09-18T13:30:00Z', sourceEndAt: '2026-09-18T20:00:00Z' }),
      'USDKRW=X': baseline('USDKRW=X', 1400, 'KRW', { ...day, precision: 'daily-reference', source: 'ecb-reference',
        sourceAt: null, sourceEndAt: null, marketClosed: null,
        fx: { method: 'ecb-reference', referenceDate: '2026-09-18', publishedAt: '2026-09-18T13:55:08Z', components: [] } }),
    },
    quotes: {
      AAPL: quote('AAPL', 100, 'USD', { quotedAt: '2026-09-18T20:00:00Z', fetchedAt, marketState: 'CLOSED' }),
      'USDKRW=X': quote('USDKRW=X', 1400, 'KRW', { quotedAt: '2026-09-18T12:59:30Z', fetchedAt, marketState: 'CLOSED' }),
    },
  };
}

test('a reference publication time is not compared with a price observation, but earlier dates still fail', () => {
  const input = mondayInput();
  const result = calculate(input);
  assert.equal(result.available, true); close(result.change, 0);
  // Same European date is valid even when the observation predates publication.
  assert.deepEqual(Array.from(result.referenceDates), ['2026-09-18']);
  const earlier = { ...input.quotes['USDKRW=X'], quotedAt: '2026-09-17T20:59:30Z' };
  assert.equal(calculate({ ...input, quotes: { ...input.quotes, 'USDKRW=X': earlier } }).available, false);
  for (const fx of [
    { referenceDate: '2026-09-21' }, { referenceDate: '2026-09-10' },
    { publishedAt: '2026-09-20T15:00:01Z' }, { publishedAt: 'invalid' },
  ]) {
    const start = input.baselines['USDKRW=X'];
    const invalid = { ...input, baselines: { ...input.baselines, 'USDKRW=X': { ...start, fx: { ...start.fx, ...fx } } } };
    assert.equal(calculate(invalid).available, false);
  }
});

test('Friday missing or early-close observations carry their actual KST date without false float32 gains', () => {
  for (const sourceAt of ['2026-09-17T12:59:00Z', '2026-09-18T12:59:00Z']) {
    const input = mondayInput(), price = Math.fround(1385.95);
    const sourceEndAt = new Date(Date.parse(sourceAt) + 60000).toISOString();
    input.baselines['USDKRW=X'] = { ...input.baselines['USDKRW=X'], price, precision: 'minute', source: 'yahoo-chart',
      sourceAt, sourceEndAt, fx: { method: 'direct', carried: true, components: [{ symbol: 'USDKRW=X', price, sourceAt }] } };
    input.quotes['USDKRW=X'] = { ...input.quotes['USDKRW=X'], price: 1385.95,
      quotedAt: new Date(Date.parse(sourceAt) + 30000).toISOString(),
      fx: { method: 'direct', carried: true, components: [{ symbol: 'USDKRW=X', price: 1385.95, sourceAt }] } };
    const result = calculate(input);
    assert.equal(result.available, true); close(result.change, 0); assert.equal(result.estimated, false);
    assert.deepEqual(Array.from(result.carriedDates), [sourceAt.slice(0, 10)]);
    assert.deepEqual(Array.from(result.carriedDatesBySymbol.AAPL), [sourceAt.slice(0, 10)]);
    assert.equal(result.referenceDates.length, 0);
    const openMarket = { ...input.quotes['USDKRW=X'], fetchedAt: '2026-09-21T01:00:00Z', marketState: 'REGULAR' };
    assert.equal(calculate({ ...input, quotes: { ...input.quotes, 'USDKRW=X': openMarket } }).available, false);
    const notFetchedToday = { ...input.quotes['USDKRW=X'], fetchedAt: '2026-09-20T14:59:00Z' };
    assert.equal(calculate({ ...input, quotes: { ...input.quotes, 'USDKRW=X': notFetchedToday } }).available, false);
  }
});

test('USD display tracks both conversion legs and only positions actually using them', () => {
  const input = mondayInput();
  const result = calculate({ ...input, displayCurrency: 'USD',
    transactions: [transaction(), transaction({ id: 'jp', symbol: '7203.T', currency: 'JPY', quantity: 1, price: 10000 })],
    quotes: { ...input.quotes, '7203.T': quote('7203.T', 10000, 'JPY'),
      'JPYKRW=X': { ...input.quotes['USDKRW=X'], symbol: 'JPYKRW=X', price: 9,
        quotedAt: '2026-09-18T20:59:00Z', fx: { method: 'direct', carried: true, components: [] } } },
    baselines: { ...input.baselines, '7203.T': { ...input.baselines.AAPL, symbol: '7203.T', currency: 'JPY', price: 10000 },
      'JPYKRW=X': { ...input.baselines['USDKRW=X'], symbol: 'JPYKRW=X', price: 9 } },
  });
  // Use a current stock observation appropriate for the requested Monday.
  assert.equal(result.available, true);
  assert.equal(result.referenceDatesBySymbol.AAPL, undefined);
  assert.deepEqual(Array.from(result.referenceDatesBySymbol['7203.T']), ['2026-09-18']);
  assert.deepEqual(Array.from(result.carriedDatesBySymbol['7203.T']), ['2026-09-19']);
});

test('the same weekend FX minute never invents a change when a quote is stamped inside that minute', () => {
  const price = 1385.949951171875;
  const nextDay = { date: '2026-09-20', baselineAt: '2026-09-19T15:00:00Z' };
  const baselines = { AAPL: baseline('AAPL', 100, 'USD', { ...nextDay, precision: 'session-close', marketClosed: true,
      sourceAt: '2026-09-18T13:30:00Z', sourceEndAt: '2026-09-18T20:00:00Z' }),
    'USDKRW=X': baseline('USDKRW=X', price, 'KRW', {
      ...nextDay,
      marketClosed: true, sourceAt: '2026-09-18T20:59:00Z', sourceEndAt: '2026-09-18T21:00:00Z',
      fx: { method: 'direct', components: [] },
    }) };
  const quotes = { AAPL: quote('AAPL', 100, 'USD', { marketState: 'CLOSED', quotedAt: '2026-09-18T20:00:00Z', fetchedAt: '2026-09-20T02:00:00Z' }),
    'USDKRW=X': quote('USDKRW=X', 1385.95, 'KRW', { marketState: 'CLOSED', quotedAt: '2026-09-18T20:59:30Z', fetchedAt: '2026-09-20T02:00:00Z' }) };
  const result = calculate({ date: nextDay.date, baselines, quotes });
  assert.equal(result.available, true); close(result.change, 0); assert.equal(result.estimated, false);
  // Wrong-date data are never accepted merely because the market is closed.
  assert.equal(calculate({ baselines, quotes }).available, false);
});

test('USD display leaves USD assets unchanged and converts KRW and JPY at each respective instant', () => {
  const result = calculate({
    displayCurrency: 'USD',
    transactions: [transaction({ quantity: 10 }),
      transaction({ id: 'kr', symbol: '005930.KS', currency: 'KRW', price: 100000 }),
      transaction({ id: 'jp', symbol: '7203.T', currency: 'JPY', price: 10000 })],
    quotes: { AAPL: quote('AAPL', 100), '005930.KS': quote('005930.KS', 100000, 'KRW'),
      '7203.T': quote('7203.T', 10000, 'JPY'), 'USDKRW=X': quote('USDKRW=X', 1250, 'KRW'),
      'JPYKRW=X': quote('JPYKRW=X', 12, 'KRW') },
    baselines: { AAPL: baseline('AAPL', 100), '005930.KS': baseline('005930.KS', 100000, 'KRW'),
      '7203.T': baseline('7203.T', 10000, 'JPY'), 'USDKRW=X': baseline('USDKRW=X', 1000, 'KRW'),
      'JPYKRW=X': baseline('JPYKRW=X', 10, 'KRW') },
  });
  assert.equal(result.available, true);
  close(result.bySymbol.AAPL, 0);
  close(result.bySymbol['005930.KS'], -20);
  close(result.bySymbol['7203.T'], -4);
  close(result.change, -24);
  close(result.priceImpact, 0);
  close(result.fxImpact, -24);
});

test('a fractional purchase removes new principal, includes its fee, and uses its recorded FX', () => {
  const result = calculate({
    transactions: [transaction(), transaction({ id: 'buy-today', date: DATE, quantity: 0.5,
      price: 120, fee: 2, fxRateToKRW: 1405, usdKrwRateAtTransaction: 1405, createdAt: CURRENT })],
    quotes: { AAPL: quote('AAPL', 130), 'USDKRW=X': quote('USDKRW=X', 1410, 'KRW') },
  });
  assert.equal(result.available, true);
  close(result.change, 47840);
  close(result.priceImpact, 46200);
  close(result.fxImpact, 1640);
});

test('full liquidation preserves realized day results and selling fees without requiring a live stock quote', () => {
  const result = calculate({
    transactions: [transaction({ quantity: 2 }), transaction({ id: 'sold-all', type: 'sell', date: DATE,
      quantity: 2, price: 120, fee: 3, fxRateToKRW: 1410, usdKrwRateAtTransaction: 1410, createdAt: CURRENT })],
    quotes: {},
  });
  assert.equal(result.available, true);
  close(result.change, 54170);
  close(result.priceImpact, 51800);
  close(result.fxImpact, 2370);
  close(result.bySymbol.AAPL, 54170);
});

test('same-day buy and sale with no opening or closing holding retains profit after both fees', () => {
  const result = calculate({
    displayCurrency: 'USD', quotes: {}, baselines: {},
    transactions: [transaction({ id: 'intraday-buy', date: DATE, quantity: 0.5, price: 100, fee: 1,
      createdAt: '2026-09-19T00:00:00.000Z' }),
    transaction({ id: 'intraday-sell', type: 'sell', date: DATE, quantity: 0.5, price: 110, fee: 1,
      createdAt: '2026-09-19T01:00:00.000Z' })],
  });
  assert.equal(result.available, true);
  close(result.change, 3);
  close(result.priceImpact, 3);
  close(result.fxImpact, 0);
});

test('KST trade dates determine opening holdings even for later-entered history; future trades stay excluded', () => {
  const transactions = [transaction({ createdAt: CURRENT }),
    transaction({ id: 'today', symbol: 'MSFT', date: DATE, createdAt: CURRENT }),
    transaction({ id: 'future', symbol: 'NVDA', date: '2026-09-20', createdAt: CURRENT })];
  const plan = planDailyChange(transactions, DATE, 'USD');
  assert.deepEqual(Array.from(plan.opening, (item) => item.symbol), ['AAPL']);
  assert.deepEqual(Array.from(plan.closing, (item) => item.symbol), ['AAPL', 'MSFT']);
  assert.deepEqual(Array.from(plan.trades, (item) => item.id), ['today']);
  assert.deepEqual(Array.from(plan.baselineSymbols), ['AAPL']);
  assert.deepEqual(Array.from(plan.liveSymbols), ['AAPL', 'MSFT']);
  assert.equal(calculate({ transactions: [] }).available, false);
});

test('missing, wrong-day, future, stale or failed market inputs cannot become a partial or zero day result', () => {
  const validBaselines = { AAPL: baseline('AAPL', 100), 'USDKRW=X': baseline('USDKRW=X', 1400, 'KRW') };
  const scenarios = [
    ['missing midnight price', { baselines: { 'USDKRW=X': validBaselines['USDKRW=X'] } }],
    ['wrong date', { baselines: { ...validBaselines, AAPL: baseline('AAPL', 100, 'USD', { date: '2026-09-18' }) } }],
    ['price after midnight', { baselines: { ...validBaselines, AAPL: baseline('AAPL', 100, 'USD', { sourceEndAt: '2026-09-18T15:01:00.000Z' }) } }],
    ['missing current price', { quotes: { 'USDKRW=X': quote('USDKRW=X', 1410, 'KRW') } }],
    ['failed current FX', { failedSymbols: ['USDKRW=X'] }],
    ['failed current stock', { failedSymbols: ['AAPL'] }],
    ['stale current stock', { quotes: { AAPL: quote('AAPL', 90, 'USD', { quotedAt: '2026-09-18T14:58:00.000Z' }), 'USDKRW=X': quote('USDKRW=X', 1410, 'KRW') } }],
    ['unfinished baseline minute stock', { quotes: { AAPL: quote('AAPL', 100, 'USD', { quotedAt: '2026-09-18T14:59:30.000Z' }), 'USDKRW=X': quote('USDKRW=X', 1410, 'KRW') } }],
    ['stale current FX', { quotes: { AAPL: quote('AAPL', 110), 'USDKRW=X': quote('USDKRW=X', 1300, 'KRW', { quotedAt: '2026-09-18T14:58:00.000Z' }) } }],
    ['unfinished baseline minute FX', { quotes: { AAPL: quote('AAPL', 110), 'USDKRW=X': quote('USDKRW=X', 1400, 'KRW', { quotedAt: '2026-09-18T14:59:30.000Z' }) } }],
    ['missing stock timestamp', { quotes: { AAPL: quote('AAPL', 110, 'USD', { quotedAt: undefined }), 'USDKRW=X': quote('USDKRW=X', 1410, 'KRW') } }],
    ['missing FX timestamp', { quotes: { AAPL: quote('AAPL', 110), 'USDKRW=X': quote('USDKRW=X', 1410, 'KRW', { quotedAt: undefined }) } }],
    ['currency mismatch', { quotes: { AAPL: quote('AAPL', 110, 'JPY'), 'USDKRW=X': quote('USDKRW=X', 1410, 'KRW') } }],
    ['missing trade FX', { transactions: [transaction(), transaction({ id: 'new', date: DATE, fxRateToKRW: undefined, createdAt: CURRENT })] }],
  ];
  for (const [label, input] of scenarios) {
    const result = calculate(input);
    assert.equal(result.available, false, label);
    assert.ok(result.reason, label);
    assert.deepEqual(Object.keys(result.bySymbol), [], label);
  }
});

test('a freshly fetched unchanged session close accepts its last trade before the published closing instant', () => {
  const input = {
    transactions: [transaction({ currency: 'KRW' })],
    baselines: { AAPL: baseline('AAPL', 100, 'KRW', { precision: 'session-close', marketClosed: true,
      sourceAt: '2026-09-18T00:00:00.000Z', sourceEndAt: '2026-09-18T06:30:00.000Z' }) },
    quotes: { AAPL: quote('AAPL', 100, 'KRW', { quotedAt: '2026-09-18T06:29:59.000Z', marketState: 'CLOSED' }) },
  };
  const result = calculate(input);
  assert.equal(result.available, true);
  close(result.change, 0);
  assert.equal(calculate({ ...input, quotes: { AAPL: { ...input.quotes.AAPL, price: 99 } } }).available, false);
  assert.equal(calculate({ ...input, quotes: { AAPL: { ...input.quotes.AAPL, fetchedAt: '2026-09-18T14:59:00.000Z' } } }).available, false);
});

test('float32 chart precision does not turn the same verified closing price into an intraday loss', () => {
  const input = {
    displayCurrency: 'USD',
    transactions: [transaction({ quantity: 10000 })],
    baselines: { AAPL: baseline('AAPL', Math.fround(109.3), 'USD', { precision: 'session-close', marketClosed: true,
      sourceAt: '2026-09-18T01:30:00.000Z', sourceEndAt: '2026-09-18T08:10:00.000Z' }) },
    quotes: { AAPL: quote('AAPL', 109.3, 'USD', { quotedAt: '2026-09-18T08:08:30.000Z', marketState: 'CLOSED' }) },
  };
  const result = calculate(input);
  assert.equal(result.available, true);
  close(result.change, 0);
  close(result.priceImpact, 0);
  assert.equal(calculate({ ...input, quotes: { AAPL: { ...input.quotes.AAPL, price: 109.29 } } }).available, false);
  assert.equal(calculate({ ...input, quotes: { AAPL: { ...input.quotes.AAPL, marketState: 'REGULAR' } } }).available, false);
  assert.equal(calculate({ ...input, baselines: { AAPL: { ...input.baselines.AAPL, precision: 'minute', marketClosed: false } } }).available, false);
});

test('minor currency units are converted once when the quote uses GBp and the stored holding uses GBX', () => {
  const result = calculate({
    transactions: [transaction({ symbol: 'VOD.L', currency: 'GBX', quantity: 2, price: 100 })],
    quotes: { 'VOD.L': quote('VOD.L', 120, 'GBp'), 'GBPKRW=X': quote('GBPKRW=X', 1800, 'KRW') },
    baselines: { 'VOD.L': baseline('VOD.L', 100, 'GBp'), 'GBPKRW=X': baseline('GBPKRW=X', 1700, 'KRW') },
  });
  assert.equal(result.available, true);
  close(result.change, 920);
  close(result.priceImpact, 680);
  close(result.fxImpact, 240);
});

test('USD holdings retain their native purchase cost and valuation without a KRW exchange-rate dependency', () => {
  const original = holding({ costBasisKRW: 200000, costBasisUSD: undefined });
  for (const fx of [{ USD: 1400 }, {}]) {
    const summary = buildSummary([original], { AAPL: quote('AAPL', 120) }, fx, 'USD');
    assert.equal(summary.holdings[0].valuationAvailable, true);
    assert.equal(summary.holdings[0].gainAvailable, true);
    close(summary.totalValue, 240);
    close(summary.totalCost, 200);
    close(summary.totalGainLoss, 40);
    close(summary.totalGainLossPercent, 20);
  }
});

test('valuation and gain flags distinguish a missing acquisition rate from a missing current price or FX', () => {
  const cases = [
    { currency: 'USD', display: 'KRW', quoteCurrency: 'USD', fx: { USD: 1400 }, value: true, gain: false },
    { currency: 'USD', display: 'KRW', quoteCurrency: 'USD', fx: { USD: 1400 }, costBasisKRW: 200000, value: true, gain: true },
    { currency: 'JPY', display: 'USD', quoteCurrency: 'JPY', fx: { JPY: 10, USD: 1400 }, costBasisKRW: 2000, value: true, gain: false },
    { currency: 'KRW', display: 'KRW', quoteCurrency: 'KRW', fx: {}, value: true, gain: true },
    { currency: 'USD', display: 'KRW', quoteCurrency: 'USD', fx: {}, value: false, gain: false },
    { currency: 'USD', display: 'KRW', quoteCurrency: 'USD', fx: { USD: NaN }, value: false, gain: false },
  ];
  for (const item of cases) {
    const result = buildSummary([holding({ currency: item.currency, costBasisKRW: item.costBasisKRW })],
      { AAPL: quote('AAPL', 120, item.quoteCurrency) }, item.fx, item.display).holdings[0];
    assert.equal(result.valuationAvailable, item.value, `${item.currency}/${item.display} valuation`);
    assert.equal(result.gainAvailable, item.gain, `${item.currency}/${item.display} gain`);
  }
  const missing = buildSummary([holding()], {}, { USD: 1400 }, 'KRW').holdings[0];
  assert.equal(missing.valuationAvailable, false);
  assert.equal(missing.gainAvailable, false);
});

test('allocation keeps every holding separate and preserves input order', () => {
  const input = [7, 40, 3, 20, 30].map((value, index) => ({
    id: `h${index}`, symbol: `S${index}`, name: `Holding ${index}`, valuationAvailable: true, displayMarketValue: value,
  }));
  const original = structuredClone(input);
  const result = buildHoldingAllocation(input);
  assert.equal(result.available, true);
  close(result.total, 100);
  assert.deepEqual(Array.from(result.segments, (segment) => segment.value), [40, 30, 20, 7, 3]);
  assert.deepEqual(new Set(result.segments.map((segment) => segment.key)), new Set(input.map((item) => item.id)));
  close(result.segments.reduce((sum, segment) => sum + segment.weight, 0), 100);
  close(result.weights.h0, 7);
  assert.deepEqual(input, original);
});

test('allocation with missing valuation never inflates known holdings to a misleading 100 percent', () => {
  const valued = { id: 'a', symbol: 'A', name: 'A', valuationAvailable: true, displayMarketValue: 100 };
  for (const input of [[], [{ ...valued, displayMarketValue: 0 }],
    [valued, { ...valued, id: 'b', valuationAvailable: false, displayMarketValue: 0 }],
    [valued, { ...valued, id: 'b', displayMarketValue: NaN }]]) {
    const result = buildHoldingAllocation(input);
    assert.equal(result.available, false);
    assert.equal(result.segments.length, 0);
    assert.deepEqual(Object.keys(result.weights), []);
  }
});

function largeAllocation(count) {
  return buildHoldingAllocation(Array.from({ length: count }, (_, index) => ({
    id: `position-${index}`, symbol: `S${String(index).padStart(3, '0')}`, name: `Holding ${index}`,
    valuationAvailable: true, displayMarketValue: count - index,
  })));
}

test('allocation pages visit all holdings once in valuation order without changing total-portfolio weights', () => {
  for (const count of [1, 13, 14, 15, 100, 101, 200]) {
    const allocation = largeAllocation(count);
    const before = JSON.stringify(allocation);
    const visited = [];
    const pageCount = Math.ceil(count / 14);
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      const page = getAllocationPage(allocation.segments, '', pageIndex);
      assert.equal(page.page, pageIndex, `${count} positions: page`);
      assert.equal(page.pageCount, pageCount, `${count} positions: page count`);
      assert.equal(page.total, count, `${count} positions: result count`);
      assert.equal(page.start, pageIndex * 14, `${count} positions: offset`);
      assert.equal(page.items.length, Math.min(14, count - pageIndex * 14), `${count} positions: page length`);
      for (const item of page.items) {
        assert.equal(item.weight, allocation.weights[item.key], `${count} positions: unchanged weight`);
        close(item.weight, item.value / allocation.total * 100);
        visited.push(item.key);
      }
    }
    assert.equal(visited.length, count);
    assert.equal(new Set(visited).size, count, `${count} positions: no duplicates`);
    assert.deepEqual(visited, Array.from(allocation.segments, (item) => item.key), `${count} positions: no missing or reordered holdings`);
    close(allocation.segments.reduce((sum, item) => sum + item.weight, 0), 100);
    assert.equal(JSON.stringify(allocation), before, `${count} positions: immutable allocation`);
  }
});

test('allocation search keeps native weights and supports names, tickers and Korean aliases across pages', () => {
  const allocation = largeAllocation(101);
  const originalWeights = Array.from(allocation.segments, (item) => item.weight);
  const resultKeys = [];
  for (let pageIndex = 0; pageIndex < 2; pageIndex += 1) {
    const page = getAllocationPage(allocation.segments, 'hOlDiNg 1', pageIndex);
    assert.equal(page.total, 12);
    assert.equal(page.pageCount, 1);
    assert.equal(page.page, 0);
    if (pageIndex === 0) resultKeys.push(...page.items.map((item) => item.key));
    for (const item of page.items) assert.equal(item.weight, allocation.weights[item.key]);
  }
  assert.deepEqual(resultKeys, ['position-1', ...Array.from({ length: 10 }, (_, index) => `position-${10 + index}`), 'position-100']);
  assert.deepEqual(Array.from(allocation.segments, (item) => item.weight), originalWeights);
  const lastTicker = getAllocationPage(allocation.segments, '  s100  ', 0);
  assert.equal(lastTicker.total, 1);
  assert.equal(lastTicker.items[0].symbol, 'S100');
  close(lastTicker.items[0].weight, 1 / allocation.total * 100);
  assert.ok(lastTicker.items[0].weight < 0.1, 'tiny searched positions never become 100 percent');

  const named = buildHoldingAllocation([
    { id: 'samsung', symbol: '005930.KS', name: 'Samsung Electronics Co., Ltd.', valuationAvailable: true, displayMarketValue: 800 },
    { id: 'naver', symbol: '035420.KS', name: 'NAVER Corporation', valuationAvailable: true, displayMarketValue: 200 },
  ]);
  assert.deepEqual(Array.from(getAllocationPage(named.segments, '삼성전자', 0).items, (item) => item.key), ['samsung']);
  assert.deepEqual(Array.from(getAllocationPage(named.segments, '네이버', 0).items, (item) => item.key), ['naver']);
  close(getAllocationPage(named.segments, '삼성전자', 0).items[0].weight, 80);
});

test('search pagination reaches every match and does not change its ordering or values', () => {
  const allocation = largeAllocation(200);
  const expected = allocation.segments.filter((item) => item.name.includes('Holding 1'));
  const visited = [];
  const first = getAllocationPage(allocation.segments, 'Holding 1', 0);
  assert.equal(first.total, 111);
  assert.equal(first.pageCount, 8);
  for (let pageIndex = 0; pageIndex < first.pageCount; pageIndex += 1) {
    const page = getAllocationPage(allocation.segments, 'Holding 1', pageIndex);
    visited.push(...page.items);
  }
  assert.deepEqual(visited.map((item) => item.key), Array.from(expected, (item) => item.key));
  assert.equal(new Set(visited.map((item) => item.key)).size, first.total);
  for (const item of visited) close(item.weight, item.value / allocation.total * 100);
});

test('deleting a final page or narrowing a search clamps pagination to an existing page', () => {
  const allocation = largeAllocation(15);
  const last = getAllocationPage(allocation.segments, '', 1);
  assert.equal(last.page, 1);
  assert.equal(last.items.length, 1);
  const afterDeletion = getAllocationPage(allocation.segments.slice(0, 14), '', last.page);
  assert.equal(afterDeletion.page, 0);
  assert.equal(afterDeletion.pageCount, 1);
  assert.equal(afterDeletion.start, 0);
  assert.equal(afterDeletion.items.length, 14);

  const many = largeAllocation(200);
  const outOfRange = getAllocationPage(many.segments, '', 999);
  assert.equal(outOfRange.page, 14);
  assert.equal(outOfRange.start, 196);
  assert.equal(outOfRange.items.length, 4);
  const narrowed = getAllocationPage(many.segments, 'S199', outOfRange.page);
  assert.equal(narrowed.page, 0);
  assert.equal(narrowed.start, 0);
  assert.equal(narrowed.items.length, 1);
  assert.equal(narrowed.items[0].symbol, 'S199');
  assert.equal(getAllocationPage(many.segments, '', -1).page, 0);

  for (const [segments, query] of [[[], ''], [many.segments, 'missing symbol']]) {
    const empty = getAllocationPage(segments, query, 999);
    assert.equal(empty.total, 0);
    assert.equal(empty.page, 0);
    assert.equal(empty.pageCount, 1);
    assert.equal(empty.start, 0);
    assert.equal(empty.items.length, 0);
  }
});
