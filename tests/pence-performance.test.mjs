import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescript } from './load-typescript.mjs';

const { buildDailyPerformance, transactionFlowKRW, kstDate } = loadTypescript('src/lib/performance.ts');
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `expected ${expected}, got ${actual}`);

function trade(overrides = {}) {
  return { id: 'buy', symbol: 'QA.L', name: 'QA', type: 'buy', date: '2020-01-01',
    quantity: 2, price: 100, fee: 5, currency: 'GBp', fxRateToKRW: 1600,
    usdKrwRateAtTransaction: 1300, createdAt: '2020-01-01T00:00:00Z', ...overrides };
}

test('pence buy and sell flows include fees once in the original price unit', () => {
  // 205 pence = GBP 2.05; proceeds of 1 share less 5p = GBP 1.15.
  for (const currency of ['GBp', 'GBX']) {
    close(transactionFlowKRW(trade({ currency })), 3280);
    close(transactionFlowKRW(trade({ currency, type: 'sell', quantity: 1, price: 120 })), -1840);
  }
  assert.equal(transactionFlowKRW(trade({ currency: 'GBP' })), 328000);
  assert.equal(transactionFlowKRW(trade({ currency: 'USD', fxRateToKRW: 1300 })), 266500);
  assert.equal(transactionFlowKRW(trade({ currency: 'KRW', fxRateToKRW: 1 })), 205);
});

test('pence history values shares and partial sales in won without a hundredfold scale error', () => {
  for (const currency of ['GBp', 'GBX']) {
    const points = buildDailyPerformance({
      transactions: [trade({ currency }), trade({ currency, id: 'sell', type: 'sell',
        date: '2020-01-02', quantity: 1, price: 120, createdAt: '2020-01-02T00:00:00Z' })],
      trackingStartDate: '2020-01-01', endDate: '2020-01-02', strict: true,
      pricesBySymbol: { 'QA.L': [{ date: '2020-01-01', close: 100 }, { date: '2020-01-02', close: 120 }] },
      fxByCurrency: { GBP: [{ date: '2020-01-01', close: 1600 }, { date: '2020-01-02', close: 1600 }] },
    });
    assert.equal(points[0].assetValueKRW, 3200);
    assert.equal(points[1].assetValueKRW, 1920);
    close(points[1].netFlowKRW, -1840);
    close(points[0].cumulativeProfitKRW, -80);
    close(points[1].cumulativeProfitKRW, 480);
    close(points[1].twrIndex, 3760 / 3280 * 100);
  }
});

test('today overrides retain the pence price unit and use the GBP exchange-rate key', () => {
  const today = kstDate();
  const points = buildDailyPerformance({
    transactions: [trade()], trackingStartDate: today, endDate: today, strict: true,
    pricesBySymbol: {}, fxByCurrency: {}, currentPrices: { 'QA.L': 125 }, currentFxRates: { GBP: 1700 },
  });
  assert.equal(points[0].assetValueKRW, 4250);
});
