import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescript } from './load-typescript.mjs';

const { buildPeriodSummaries } = loadTypescript('src/features/performance/period-summary.ts');
const { addCalendarDays, buildDailyPerformance } = loadTypescript('src/lib/performance.ts');

function transaction(date, type, price, overrides = {}) {
  return { id: `${date}-${type}`, symbol: 'QA', name: 'QA', date, type,
    quantity: 1, price, fee: 0, currency: 'KRW', fxRateToKRW: 1,
    createdAt: `${date}T00:00:00Z`, ...overrides };
}

function history(transactions, startDate, endDate, prices = [], extra = {}) {
  return buildDailyPerformance({ transactions, trackingStartDate: startDate, endDate,
    pricesBySymbol: { QA: prices }, fxByCurrency: {}, strict: true, ...extra });
}

function close(actual, expected) {
  assert.ok(actual != null && Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
}

function rowsByKey(rows) {
  return Object.fromEntries(rows.map(row => [row.key, row]));
}

test('December rise and January sale each report only the profit earned in that month', () => {
  const trades = [transaction('2024-12-01', 'buy', 1_000_000), transaction('2025-01-31', 'sell', 2_000_000)];
  const points = history(trades, '2024-12-01', '2025-01-31', [
    { date: '2024-12-01', close: 1_000_000 }, { date: '2024-12-31', close: 1_500_000 },
  ]);
  const rows = buildPeriodSummaries(points, trades, 'month');
  assert.deepEqual(Array.from(rows, row => row.key), ['2025-01', '2024-12']);
  const months = rowsByKey(rows);
  assert.equal(months['2024-12'].profitKRW, 500_000);
  close(months['2024-12'].securitiesReturn, 50);
  assert.equal(months['2025-01'].profitKRW, 500_000);
  close(months['2025-01'].securitiesReturn, 100 / 3);
  assert.ok(rows.every(row => row.complete && !row.inactive));
  assert.equal(points.at(-1).assetValueKRW, 0);
  assert.equal(months['2025-01'].profitKRW + months['2024-12'].profitKRW, 1_000_000);
  const years = rowsByKey(buildPeriodSummaries(points, trades, 'year'));
  assert.equal(years['2024'].profitKRW, 500_000);
  assert.equal(years['2025'].profitKRW, 500_000);
  assert.equal(years['2024'].complete, false);
});

test('annual profit sums monthly amounts but annual return compounds daily growth, not monthly percentages', () => {
  const trades = [transaction('2025-01-01', 'buy', 1_000_000), transaction('2025-02-28', 'sell', 2_000_000)];
  const points = history(trades, '2025-01-01', '2025-12-31', [
    { date: '2025-01-01', close: 1_000_000 }, { date: '2025-01-31', close: 1_500_000 },
  ]);
  const months = buildPeriodSummaries(points, trades, 'month');
  const [year] = buildPeriodSummaries(points, trades, 'year');
  assert.equal(year.profitKRW, months.reduce((sum, row) => sum + row.profitKRW, 0));
  assert.equal(year.profitKRW, 1_000_000);
  close(year.securitiesReturn, 100);
  assert.notEqual(year.securitiesReturn, months.reduce((sum, row) => sum + (row.securitiesReturn ?? 0), 0));
  assert.equal(year.complete, true);
  assert.equal(year.inactive, false);
  assert.equal(months[0].profitKRW, 0);
  assert.equal(months[0].securitiesReturn, null);
  assert.equal(months[0].inactive, true);
});

test('unsold price gains use the period opening valuation instead of the original purchase cost', () => {
  const trades = [transaction('2025-01-01', 'buy', 1_000_000)];
  const points = history(trades, '2025-01-01', '2025-02-28', [
    { date: '2025-01-01', close: 1_000_000 }, { date: '2025-01-31', close: 1_200_000 },
    { date: '2025-02-28', close: 1_320_000 },
  ]);
  const months = rowsByKey(buildPeriodSummaries(points, trades, 'month'));
  assert.equal(months['2025-01'].profitKRW, 200_000);
  assert.equal(months['2025-02'].profitKRW, 120_000);
  close(months['2025-02'].securitiesReturn, 10);
});

test('partial sale, full sale and an idle month preserve earned results without inventing cash', () => {
  const trades = [transaction('2025-01-01', 'buy', 100, { quantity: 10 }),
    transaction('2025-01-15', 'sell', 120, { quantity: 5 }),
    transaction('2025-01-20', 'sell', 140, { quantity: 5 })];
  const points = history(trades, '2025-01-01', '2025-02-28', [
    { date: '2025-01-01', close: 100 }, { date: '2025-01-15', close: 120 },
  ]);
  const months = rowsByKey(buildPeriodSummaries(points, trades, 'month'));
  assert.equal(months['2025-01'].profitKRW, 300);
  close(months['2025-01'].securitiesReturn, 40);
  assert.equal(months['2025-01'].inactive, false);
  assert.equal(months['2025-02'].profitKRW, 0);
  assert.equal(months['2025-02'].securitiesReturn, null);
  assert.equal(months['2025-02'].inactive, true);
  assert.ok(points.filter(point => point.date >= '2025-01-20').every(point => point.assetValueKRW === 0));
});

test('additional buys do not count as profit, and re-entry after sale links the existing daily returns', () => {
  const trades = [transaction('2025-01-01', 'buy', 100, { quantity: 10 }),
    transaction('2025-01-02', 'buy', 100, { quantity: 5 }),
    transaction('2025-01-03', 'sell', 100, { quantity: 6 }),
    transaction('2025-01-04', 'sell', 120, { quantity: 9 }),
    transaction('2025-01-06', 'buy', 100, { quantity: 7 })];
  const points = history(trades, '2025-01-01', '2025-01-31', [
    { date: '2025-01-01', close: 100 }, { date: '2025-01-06', close: 100 },
    { date: '2025-01-07', close: 110 },
  ]);
  const [month] = buildPeriodSummaries(points, trades, 'month');
  assert.equal(month.profitKRW, 250);
  close(month.securitiesReturn, 32);
});

test('same-day buy and sale preserve both fees and recorded foreign exchange rates', () => {
  const trades = [transaction('2025-01-01', 'buy', 100, { currency: 'USD', fee: 2, fxRateToKRW: 1000 }),
    transaction('2025-01-01', 'sell', 110, { currency: 'USD', fee: 3, fxRateToKRW: 1200 })];
  const points = history(trades, '2025-01-01', '2025-01-31');
  const [month] = buildPeriodSummaries(points, trades, 'month');
  assert.equal(month.profitKRW, 26_400);
  close(month.securitiesReturn, 26_400 / 102_000 * 100);
  assert.equal(month.inactive, false);
  assert.ok(points.every(point => point.assetValueKRW === 0));
});

test('pence unit conversion is inherited from the existing transaction calculation', () => {
  const trades = [transaction('2025-01-01', 'buy', 10_000, { currency: 'GBp', fee: 200, fxRateToKRW: 1600 }),
    transaction('2025-01-01', 'sell', 11_000, { currency: 'GBX', fee: 100, fxRateToKRW: 1700 })];
  const [month] = buildPeriodSummaries(history(trades, '2025-01-01', '2025-01-31'), trades, 'month');
  assert.equal(month.profitKRW, 109 * 1700 - 102 * 1600);
  close(month.securitiesReturn, month.profitKRW / (102 * 1600) * 100);
});

test('foreign held-asset appreciation includes price and FX changes with no sale', () => {
  const trades = [transaction('2025-01-01', 'buy', 100, { currency: 'USD', fxRateToKRW: 1000 })];
  const rates = Array.from({ length: 31 }, (_, index) => ({
    date: addCalendarDays('2025-01-01', index), close: index === 30 ? 1200 : 1000,
  }));
  const points = history(trades, '2025-01-01', '2025-01-31', [
    { date: '2025-01-01', close: 100 }, { date: '2025-01-31', close: 110 },
  ], { fxByCurrency: { USD: rates } });
  const [month] = buildPeriodSummaries(points, trades, 'month');
  assert.equal(month.profitKRW, 32_000);
  close(month.securitiesReturn, 32);
});

test('leap February and calendar years require every day and final points to be complete', () => {
  const leap = history([], '2024-02-01', '2024-02-29');
  const [month] = buildPeriodSummaries(leap, [], 'month');
  assert.equal(month.endDate, '2024-02-29');
  assert.equal(month.complete, true);
  assert.equal(month.inactive, true);
  const fullYear = history([], '2024-01-01', '2024-12-31');
  assert.equal(fullYear.length, 366);
  assert.equal(buildPeriodSummaries(fullYear, [], 'year')[0].complete, true);
  const pending = leap.map(point => ({ ...point, final: point.date !== '2024-02-29' }));
  assert.equal(buildPeriodSummaries(pending, [], 'month')[0].complete, false);
});

test('first and current partial periods retain their actual dates and valid calculations', () => {
  const trades = [transaction('2025-01-20', 'buy', 100)];
  const points = history(trades, '2025-01-20', '2025-02-10', [{ date: '2025-01-20', close: 110 }]);
  points.at(-1).final = false;
  const months = rowsByKey(buildPeriodSummaries(points, trades, 'month'));
  assert.equal(months['2025-01'].startDate, '2025-01-20');
  assert.equal(months['2025-01'].endDate, '2025-01-31');
  assert.equal(months['2025-01'].complete, false);
  assert.equal(months['2025-01'].profitKRW, 10);
  assert.equal(months['2025-02'].startDate, '2025-02-01');
  assert.equal(months['2025-02'].endDate, '2025-02-10');
  assert.equal(months['2025-02'].complete, false);
  assert.equal(months['2025-02'].profitKRW, 0);
  assert.equal(months['2025-02'].inactive, false);
});

test('missing, nonfinite and inconsistent valuations never become a zero result or an inactive label', () => {
  const base = history([], '2025-01-01', '2025-01-31');
  const variants = [undefined, null, NaN, Infinity, -Infinity, -1].flatMap(value => [
    base.map((point, index) => index === 0 ? { ...point, openingValueKRW: value } : point),
    base.map((point, index) => index === 15 ? { ...point, assetValueKRW: value } : point),
  ]);
  variants.push(base.filter(point => point.date !== '2025-01-15'));
  variants.push([...base, base[0]]);
  variants.push(base.map((point, index) => index === 15 ? { ...point, openingValueKRW: 100 } : point));
  for (const points of variants) {
    const [month] = buildPeriodSummaries(points, [], 'month');
    assert.equal(month.profitKRW, null);
    assert.equal(month.securitiesReturn, null);
    assert.equal(month.inactive, false);
    assert.equal(month.complete, false);
  }
});

test('missing transaction FX, invalid amounts and overflow cannot be silently counted as zero flow', () => {
  const points = history([], '2025-01-01', '2025-01-31');
  const badTrades = [
    transaction('2025-01-01', 'buy', 100, { currency: 'USD', fxRateToKRW: undefined }),
    transaction('2025-01-01', 'buy', 100, { currency: 'USD', fxRateToKRW: 0 }),
    transaction('2025-01-01', 'buy', 100, { currency: 'USD', fxRateToKRW: Infinity }),
    transaction('2025-01-01', 'buy', NaN),
    transaction('2025-01-01', 'buy', 100, { fee: Infinity }),
    transaction('2025-01-01', 'buy', 100, { quantity: -1 }),
    transaction('2025-01-01', 'buy', -100),
    transaction('2025-01-01', 'buy', Number.MAX_VALUE, { quantity: Number.MAX_VALUE }),
  ];
  for (const trade of badTrades) {
    const [month] = buildPeriodSummaries(points, [trade], 'month');
    assert.equal(month.profitKRW, null);
    assert.equal(month.securitiesReturn, null);
    assert.equal(month.inactive, false);
  }
});

test('a total loss is retained in annual return while a later month starts from its own capital', () => {
  const trades = [transaction('2025-01-01', 'buy', 100), transaction('2025-01-02', 'sell', 0),
    transaction('2025-02-01', 'buy', 100)];
  const points = history(trades, '2025-01-01', '2025-02-28', [
    { date: '2025-01-01', close: 100 }, { date: '2025-02-28', close: 110 },
  ]);
  const months = rowsByKey(buildPeriodSummaries(points, trades, 'month'));
  assert.equal(months['2025-01'].profitKRW, -100);
  close(months['2025-01'].securitiesReturn, -100);
  assert.equal(months['2025-02'].profitKRW, 10);
  close(months['2025-02'].securitiesReturn, 10);
  const [year] = buildPeriodSummaries(points, trades, 'year');
  assert.equal(year.profitKRW, -90);
  close(year.securitiesReturn, -100);
});

test('empty inputs, unsorted points and trades preserve caller data and ignore trades outside coverage', () => {
  assert.deepEqual(Array.from(buildPeriodSummaries([], [], 'month')), []);
  const inRange = [transaction('2025-01-01', 'buy', 100), transaction('2025-02-28', 'sell', 120)];
  const points = history(inRange, '2025-01-01', '2025-02-28', [{ date: '2025-01-01', close: 100 }]).reverse();
  const trades = [transaction('2026-01-01', 'buy', NaN), ...inRange.toReversed()];
  const before = structuredClone({ points, trades });
  const rows = buildPeriodSummaries(points, trades, 'month');
  assert.deepEqual(Array.from(rows, row => row.key), ['2025-02', '2025-01']);
  assert.equal(rows[0].profitKRW, 20);
  close(rows[0].securitiesReturn, 20);
  assert.deepEqual(structuredClone({ points, trades }), before);
  assert.notEqual(rows[0], points[0]);
});
