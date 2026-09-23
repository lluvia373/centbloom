import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadTypescript } from './load-typescript.mjs';

const { applyCommand } = loadTypescript('src/features/portfolio/model/commands.ts');
const { deriveHoldings } = loadTypescript('src/lib/portfolio.ts');
const { buildSummary } = loadTypescript('src/features/portfolio/model/summary.ts');
const { calculateDailyChange, planDailyChange } = loadTypescript('src/features/portfolio/model/daily-change.ts');
const day = '2026-09-22';
const trade = (changes = {}) => ({
  id: 'buy', symbol: 'TEST', name: 'Test stock', type: 'buy', date: '2026-09-20',
  quantity: 1, price: 1_000_000, fee: 0, currency: 'KRW', fxRateToKRW: 1,
  usdKrwRateAtTransaction: 1400, createdAt: '2026-09-20T00:00:00.000Z', ...changes,
});
const sell = trade({ id: 'sell', type: 'sell', date: '2026-09-21', price: 2_000_000, createdAt: '2026-09-21T00:00:00.000Z' });
const add = (records, record) => applyCommand(records, { type: 'add', transaction: record }).transactions;
const usdConversionQuote = {
  symbol: 'USDKRW=X', name: 'USDKRW=X', price: 1400, currency: 'KRW', change: 0, changePercent: 0,
  quotedAt: '2026-09-22T00:00:00.000Z', fetchedAt: '2026-09-22T00:01:00.000Z',
  marketState: 'REGULAR', source: 'yahoo-quote',
};

test('holdings-only lifecycle: one million doubles, full sale leaves zero assets without deleting trades', () => {
  const records = add([], trade());
  const appreciated = buildSummary(deriveHoldings(records), { TEST: { symbol: 'TEST', price: 2_000_000, currency: 'KRW' } }, {}, 'KRW');
  assert.equal(appreciated.totalValue, 2_000_000);
  assert.equal(appreciated.totalGainLoss, 1_000_000);
  const sold = add(records, sell);
  assert.equal(sold.length, 2);
  assert.equal(deriveHoldings(sold).length, 0);
  for (const currency of ['KRW', 'USD']) {
    const summary = buildSummary(deriveHoldings(sold), {}, {}, currency);
    for (const field of ['totalAssets', 'investmentAssets', 'cashAssets', 'totalValue', 'totalCost', 'totalGainLoss']) {
      assert.equal(summary[field], 0, `${currency} ${field}`);
    }
  }
  const reinvested = add(sold, trade({ id: 'reenter', date: day, price: 3_000_000, createdAt: `${day}T00:00:00.000Z` }));
  assert.equal(reinvested.length, 3, 'a new purchase does not require or consume an invented cash balance');
  assert.equal(deriveHoldings(reinvested)[0].avgCost, 3_000_000, 'old sold cost basis is not reused');
});

test('sale edits, deletion and restoration change recorded holdings, never create balancing cash entries', () => {
  const records = add(add([], trade()), sell);
  assert.throws(() => applyCommand(records, { type: 'delete', id: 'buy' }), /보유 수량/);
  assert.throws(() => applyCommand(records, { type: 'update', id: 'sell', changes: { quantity: 2 } }), /보유 수량/);
  const reopened = applyCommand(records, { type: 'delete', id: 'sell' }).transactions;
  assert.equal(reopened.length, 1);
  assert.equal(deriveHoldings(reopened)[0].quantity, 1);
  const restored = applyCommand(reopened, { type: 'restore', transaction: sell }).transactions;
  assert.equal(restored.length, 2);
  assert.equal(deriveHoldings(restored).length, 0);
  const partial = applyCommand(records, { type: 'update', id: 'sell', changes: { quantity: 0.25, fee: 10 } }).transactions;
  assert.equal(deriveHoldings(partial)[0].quantity, 0.75);
  assert.equal(deriveHoldings(partial)[0].costBasisKRW, 750_000);
  assert.equal(partial.length, 2);
});

test('after full sale an inactive day has zero daily profit and requires no market inputs', () => {
  const transactions = [trade(), sell];
  for (const displayCurrency of ['KRW', 'USD']) {
    const plan = planDailyChange(transactions, day, displayCurrency);
    assert.deepEqual(Array.from(plan.symbols), []);
    assert.deepEqual(Array.from(plan.liveSymbols), []);
    assert.deepEqual(Array.from(plan.baselineSymbols), []);
    const result = calculateDailyChange({ transactions, date: day, displayCurrency, quotes: {}, baselines: {} });
    assert.equal(result.available, true);
    assert.equal(result.change, 0);
    assert.equal(result.priceImpact, 0);
    assert.equal(result.fxImpact, 0);
    assert.equal(result.reason, null);
  }
});

test('a full sale today retains its realized daily result without requesting a current sold stock or FX quote', () => {
  const transactions = [trade({ currency: 'USD', price: 100, fxRateToKRW: 1400 }),
    sell,];
  transactions[1] = trade({ id: 'today-sale', type: 'sell', date: day, currency: 'USD', price: 200,
    fxRateToKRW: 1400, createdAt: `${day}T00:00:00.000Z` });
  const plan = planDailyChange(transactions, day, 'KRW');
  assert.deepEqual(Array.from(plan.liveSymbols), []);
  assert.deepEqual(Array.from(plan.baselineSymbols), ['TEST', 'USDKRW=X']);
  const baseline = (symbol, price, currency) => ({ symbol, price, currency, date: day,
    baselineAt: '2026-09-21T15:00:00.000Z', sourceAt: '2026-09-21T14:59:00.000Z',
    sourceEndAt: '2026-09-21T15:00:00.000Z', precision: 'minute', status: 'available', source: 'yahoo-chart' });
  const result = calculateDailyChange({ transactions, date: day, displayCurrency: 'KRW', quotes: {},
    baselines: { TEST: baseline('TEST', 100, 'USD'), 'USDKRW=X': baseline('USDKRW=X', 1400, 'KRW') } });
  assert.equal(result.available, true);
  assert.equal(result.change, 140_000);
  assert.equal(result.bySymbol.TEST, 140_000);
});

function marketProvider(initialLedger, currency = 'KRW', liveState = {}) {
  let ledger = initialLedger;
  const calls = [];
  let market;
  const { PortfolioMarketProvider, usePortfolioMarket } = loadTypescript('src/features/portfolio/state/market.tsx', {
    '../state/ledger': { useTransactions: () => ledger },
    './ledger': { useTransactions: () => ledger },
    './preferences': { usePreferences: () => ({ displayCurrency: currency }) },
    'next/navigation': { usePathname: () => '/portfolio' },
    '@/hooks/useLiveQuotes': { useLiveQuotes: (symbols, options) => {
      calls.push({ symbols: Array.from(symbols), enabled: options.enabled });
      return { quotes: {}, loading: false, failedSymbols: [], checkedAt: null, refresh: async () => {}, ...liveState };
    } },
  });
  function Capture() { market = usePortfolioMarket(); return null; }
  const render = (next = ledger) => {
    ledger = next;
    calls.length = 0;
    renderToStaticMarkup(createElement(PortfolioMarketProvider, null, createElement(Capture)));
    return { market, calls };
  };
  return render;
}

test('current summary distinguishes confirmed zero holdings from unread or failed ledger state', () => {
  const render = marketProvider({ transactions: [], revision: '', status: 'loading' });
  assert.equal(render().market.summary, null);
  assert.equal(render().market.loading, true);
  assert.equal(render({ transactions: [], revision: '', status: 'failed' }).market.summary, null);
  const empty = render({ transactions: [], revision: '[]', status: 'ready' });
  assert.equal(empty.market.summary.totalValue, 0);
  assert.equal(empty.market.loading, false);
  assert.ok(empty.calls.every(call => !call.enabled));
  const sold = render({ transactions: [trade(), sell], revision: 'sold', status: 'ready' });
  assert.equal(sold.market.summary.totalValue, 0);
  assert.equal(sold.market.summary.totalGainLoss, 0);
  assert.ok(sold.calls.every(call => !call.enabled));
});

test('USD history can keep its conversion quote after full sale without blocking confirmed zero holdings', () => {
  const ledger = { transactions: [trade(), sell], revision: 'sold', status: 'ready' };
  const pending = marketProvider(ledger, 'USD', { loading: true })();
  assert.equal(pending.market.summary.totalValue, 0);
  assert.equal(pending.market.loading, false);
  assert.equal(pending.market.currentUsdKrwRate, null);
  assert.deepEqual(pending.calls.filter(call => call.enabled).flatMap(call => call.symbols), ['USDKRW=X']);
  const confirmed = marketProvider(ledger, 'USD', { quotes: { 'USDKRW=X': usdConversionQuote },
    checkedAt: Date.parse(usdConversionQuote.fetchedAt) })();
  assert.equal(confirmed.market.currentUsdKrwRate, 1400);
  const failed = marketProvider(ledger, 'USD', { failedSymbols: ['USDKRW=X'] })();
  assert.equal(failed.market.summary.totalValue, 0);
  assert.match(failed.market.marketDataError, /업데이트하지 못했습니다/);
});

test('zero holdings do not allow unverified or valuation-only FX into current USD history conversion', () => {
  const ledger = { transactions: [trade(), sell], revision: 'sold', status: 'ready' };
  for (const quote of [
    { price: 1400 },
    { ...usdConversionQuote, quotedAt: undefined },
    { ...usdConversionQuote, quotedAt: '2026-09-21T00:00:00.000Z' },
    { ...usdConversionQuote, fx: { method: 'direct', components: [], valuationOnly: true } },
  ]) {
    const { market } = marketProvider(ledger, 'USD', { quotes: { 'USDKRW=X': quote },
      checkedAt: Date.parse(usdConversionQuote.fetchedAt) })();
    assert.equal(market.currentUsdKrwRate, null);
    assert.equal(market.summary.totalValue, 0);
    assert.equal(market.loading, false);
  }
});

test('confirmed empty holdings show zero asset and unrealized amounts without an invented return percentage', () => {
  let summary = buildSummary([], {}, {}, 'KRW');
  const { PortfolioMetrics } = loadTypescript('src/components/PortfolioMetrics.tsx', { '@/hooks/usePortfolio': {
    usePreferences: () => ({ displayCurrency: 'KRW' }),
    usePortfolioMarket: () => ({ summary, loading: false }),
    usePortfolioDailyChange: () => ({ available: true, change: 500, priceImpact: 500, fxImpact: 0, bySymbol: { SOLD: 500 } }),
  } });
  const html = renderToStaticMarkup(createElement(PortfolioMetrics));
  assert.match(html, /portfolio-summary-value">₩0<\/dd>/);
  assert.match(html, /portfolio-summary-gain "><span>₩0<\/span>/);
  assert.doesNotMatch(html, /portfolio-summary-percent/);
  assert.match(html, /전량 매도 1종목 \+₩500 포함/);
  summary = null;
  const unknown = renderToStaticMarkup(createElement(PortfolioMetrics));
  assert.match(unknown, /portfolio-summary-value">—<\/dd>/);
  assert.match(unknown, /거래 기록 확인 필요/);
  assert.doesNotMatch(unknown, /보유종목 없음/);
});

test('a guest ledger reload preserves sold history and zero holdings without storing cash', async () => {
  const { localRepository } = loadTypescript('src/features/portfolio/data/local.ts');
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const repository = localRepository(storage, null);
  const original = await repository.read();
  const transactions = add(add([], trade()), sell);
  await repository.commit({ id: 'write', revision: original.revision, transactions });
  const reloaded = await localRepository(storage, null).read();
  assert.equal(reloaded.transactions.length, 2);
  assert.equal(deriveHoldings(reloaded.transactions).length, 0);
  assert.doesNotMatch(JSON.stringify([...values.entries()]), /cash|현금/);
  assert.equal(reloaded.transactions.find(tx => tx.type === 'sell').price, 2_000_000);
});

test('daily result never mistakes failed initial ledger loading for a confirmed inactive day', () => {
  let ledger = { transactions: [], status: 'loading', revision: '' };
  let result;
  const { usePortfolioDailyChange } = loadTypescript('src/features/portfolio/state/use-daily-change.ts', {
    './ledger': { useTransactions: () => ledger },
    './preferences': { usePreferences: () => ({ displayCurrency: 'KRW' }) },
    '@/shared/time/use-kst-date': { useKstDate: () => day },
    '@/hooks/useLiveQuotes': { useLiveQuotes: () => ({ quotes: {}, loading: false, failedSymbols: [] }) },
    '@/lib/stock-api': { getMidnightBaseline: () => { throw new Error('not requested'); } },
    '@/shared/async/shared-resource': { createSharedResource: () => {
      const state = { value: {}, loading: false };
      return { initial: state, snapshot: () => state, subscribe: () => () => {} };
    } },
  });
  function Capture() { result = usePortfolioDailyChange(); return null; }
  const render = () => renderToStaticMarkup(createElement(Capture));
  render(); assert.equal(result.available, false);
  ledger = { ...ledger, status: 'failed' };
  render(); assert.equal(result.available, false); assert.equal(result.reason, '거래 기록 확인 필요');
  ledger = { transactions: [trade(), sell], status: 'ready', revision: 'sold' };
  render(); assert.equal(result.available, true); assert.equal(result.change, 0);
});
