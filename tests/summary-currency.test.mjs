import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescript } from './load-typescript.mjs';

const { buildSummary } = loadTypescript('src/features/portfolio/model/summary.ts');
const { deriveHoldings } = loadTypescript('src/lib/portfolio.ts');

function holding(overrides = {}) {
  return Object.freeze({
    id: 'TEST', symbol: 'TEST', name: 'Test company', quantity: 2,
    avgCost: 100, currency: 'USD', addedAt: '2026-01-01', ...overrides,
  });
}

function quote(price, currency) {
  return { symbol: 'TEST', name: 'Test company', price, currency, change: 0, changePercent: 0 };
}

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-7, `expected ${expected}, received ${actual}`);
}

test('a different quote currency never relabels the stored purchase price or enables gains', () => {
  for (const display of ['KRW', 'USD']) {
    const original = holding({ currency: 'KRW', costBasisKRW: 200, costBasisUSD: 0.16 });
    const item = buildSummary([original], { TEST: quote(120, 'USD') }, { USD: 1400 }, display).holdings[0];
    assert.equal(item.currency, 'KRW');
    assert.equal(item.avgCost, 100);
    assert.equal(item.quote.currency, 'USD');
    assert.equal(item.valuationAvailable, true);
    assert.equal(item.gainAvailable, false);
    close(item.marketValueKRW, 336000);
    close(item.marketValueUSD, 240);
    close(item.resolvedCostBasisKRW, 200);
    close(item.resolvedCostBasisUSD, 0.16);
    assert.equal(item.acquisitionFxRateToKRW, undefined);
    close(item.stockPriceImpactKRW, 0);
    close(item.fxImpactKRW, 0);
    assert.equal(original.currency, 'KRW');
  }
});

test('missing converted cost bases are derived from the purchase currency, never the quote currency', () => {
  const wonCost = buildSummary([holding({ currency: 'KRW' })], { TEST: quote(120, 'USD') }, { USD: 1400 }, 'USD').holdings[0];
  close(wonCost.resolvedCostBasisKRW, 200);
  close(wonCost.resolvedCostBasisUSD, 200 / 1400);
  assert.equal(wonCost.gainAvailable, false);

  const dollarCost = buildSummary([holding()], { TEST: quote(120, 'KRW') }, { USD: 1400 }, 'KRW').holdings[0];
  close(dollarCost.resolvedCostBasisKRW, 280000);
  close(dollarCost.resolvedCostBasisUSD, 200);
  close(dollarCost.marketValueKRW, 240);
  assert.equal(dollarCost.currency, 'USD');
  assert.equal(dollarCost.gainAvailable, false);
});

test('pounds, pence, and the GBX alias compare equivalent money and preserve acquisition FX', () => {
  const cases = [
    { costCurrency: 'GBP', avgCost: 1, quoteCurrency: 'GBp', price: 120, nativeGain: 0.4 },
    { costCurrency: 'GBp', avgCost: 100, quoteCurrency: 'GBP', price: 1.2, nativeGain: 40 },
    { costCurrency: 'GBX', avgCost: 100, quoteCurrency: 'GBp', price: 120, nativeGain: 40 },
  ];
  for (const item of cases) {
    const original = holding({ currency: item.costCurrency, avgCost: item.avgCost, costBasisKRW: 3400, costBasisUSD: 2.5 });
    for (const display of ['KRW', 'USD']) {
      const result = buildSummary([original], { TEST: quote(item.price, item.quoteCurrency) }, { GBP: 1800, USD: 1400 }, display).holdings[0];
      assert.equal(result.currency, item.costCurrency);
      assert.equal(result.valuationAvailable, true);
      assert.equal(result.gainAvailable, true);
      close(result.gainLoss, item.nativeGain);
      close(result.gainLossPercent, 20);
      close(result.marketValueKRW, 4320);
      close(result.resolvedCostBasisKRW, 3400);
      close(result.gainLossKRW, 920);
      close(result.marketValueUSD, 4320 / 1400);
      close(result.resolvedCostBasisUSD, 2.5);
      close(result.acquisitionFxRateToKRW, 1700);
      close(result.stockPriceImpactKRW, 680);
      close(result.fxImpactKRW, 240);
    }
  }
});

test('a USD purchase and quote remain calculable in USD without a won exchange rate', () => {
  const result = buildSummary([holding()], { TEST: quote(120, 'USD') }, {}, 'USD');
  assert.equal(result.holdings[0].gainAvailable, true);
  close(result.totalValue, 240);
  close(result.totalCost, 200);
  close(result.totalGainLoss, 40);
  close(result.totalGainLossPercent, 20);
});

test('decimal purchase cost is preserved from the ledger through valuation and gains', () => {
  for (const price of [5.26, 526]) {
    const transactions = [{ id: 'sample', symbol: 'TEST', name: 'Example company', type: 'buy',
      date: '2020-01-01', createdAt: '2020-01-01T00:00:00Z', quantity: 2, price,
      fee: 0, currency: 'USD', fxRateToKRW: 1300, usdKrwRateAtTransaction: 1300 }];
    const holdings = deriveHoldings(transactions);
    const quotes = { TEST: quote(4.56, 'USD') };
    const dollar = buildSummary(holdings, quotes, { USD: 1400 }, 'USD');
    const won = buildSummary(holdings, quotes, { USD: 1400 }, 'KRW');
    close(dollar.holdings[0].avgCost, price);
    close(dollar.totalValue, 9.12);
    close(dollar.totalCost, price === 5.26 ? 10.52 : 1052);
    close(dollar.totalGainLoss, price === 5.26 ? -1.4 : -1042.88);
    close(won.totalGainLoss, price === 5.26 ? -908 : -1354832);
    assert.equal(transactions[0].price, price);
  }
});
