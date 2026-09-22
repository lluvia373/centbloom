import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescript } from './load-typescript.mjs';

const {
  addCalendarDays,
  buildDailyPerformance,
  buildMoneyWeightedReturnSeries,
  buildSecuritiesReturnSeries,
  calculatePerformanceMetrics,
  normalizePerformancePoints,
} = loadTypescript('src/lib/performance.ts');

function point(date, assetValueKRW, twrIndex = 100) {
  return { date, cutoffAt: `${date}T23:59:59+09:00`, assetValueKRW, twrIndex,
    netFlowKRW: 0, cumulativeNetFlowKRW: 0, cumulativeProfitKRW: 0,
    active: assetValueKRW > 0.01, final: true };
}

function transaction(date, type, amount, overrides = {}) {
  return { id: `${date}-${type}`, symbol: 'QA', name: 'QA', date, type,
    quantity: 1, price: amount, fee: 0, currency: 'KRW', fxRateToKRW: 1,
    createdAt: `${date}T00:00:00Z`, ...overrides };
}

function assertClose(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
}

function assertEveryEndpointMatches(points, transactions) {
  const series = buildMoneyWeightedReturnSeries(points, transactions);
  for (let index = 0; index < points.length; index++) {
    const metrics = calculatePerformanceMetrics(points, transactions, points[0].date, points[index].date);
    assert.equal(series[index].portfolioReturn, metrics.moneyWeightedReturn);
  }
  return series;
}

test('cumulative period return is nonannualized and preserves input points without flows', () => {
  const points = [point('2026-01-01', 100), point('2026-01-02', 110), point('2026-01-03', 90)];
  const before = structuredClone(points);
  const series = assertEveryEndpointMatches(points, []);
  assert.deepEqual(Array.from(series, item => item.portfolioReturn), [0, 10, -10]);
  assert.deepEqual(points, before);
  for (let index = 0; index < points.length; index++) {
    const originalFields = { ...series[index] };
    delete originalFields.portfolioReturn;
    assert.deepEqual(JSON.parse(JSON.stringify(originalFields)), points[index]);
    assert.notEqual(series[index], points[index]);
  }
});

test('profit and period return share a sign when time weighted return points the other way', () => {
  const points = [point('2026-01-01', 100, 100), point('2026-01-02', 50, 50),
    point('2026-01-03', 1000, 50), point('2026-01-04', 1100, 55)];
  const transactions = [transaction('2026-01-03', 'buy', 950)];
  const series = assertEveryEndpointMatches(points, transactions);
  const metrics = calculatePerformanceMetrics(points, transactions, '2026-01-01', '2026-01-04');
  assert.equal(metrics.profitKRW, 50);
  assert.ok(metrics.operatingReturn < 0);
  assertClose(metrics.moneyWeightedReturn, 12);
  assertClose(series.at(-1).portfolioReturn, 12);
  assert.ok(normalizePerformancePoints(points).at(-1).portfolioReturn < 0);
});

test('buys, partial sales, fees and unsorted transactions use elapsed-day cash-flow weights', () => {
  const points = [point('2026-01-01', 1000), point('2026-01-02', 1120),
    point('2026-01-03', 1100), point('2026-01-04', 1120)];
  const transactions = [transaction('2026-01-03', 'sell', 100, { fee: 3 }),
    transaction('2026-01-02', 'buy', 100, { fee: 2 })];
  const before = structuredClone(transactions);
  const series = assertEveryEndpointMatches(points, transactions);
  const metrics = calculatePerformanceMetrics(points, transactions, '2026-01-01', '2026-01-04');
  assert.equal(metrics.profitKRW, 115);
  assertClose(series.at(-1).portfolioReturn, 115 / (1000 + 102 * 2 / 3 - 97 / 3) * 100);
  assert.deepEqual(transactions, before);
});

test('holdings-only history preserves period profit through added purchases, sales and re-entry', () => {
  const transactions = [
    transaction('2026-01-01', 'buy', 100, { quantity: 10 }),
    transaction('2026-01-02', 'buy', 100, { quantity: 5 }),
    transaction('2026-01-03', 'sell', 100, { quantity: 6 }),
    transaction('2026-01-04', 'sell', 120, { quantity: 9 }),
    transaction('2026-01-06', 'buy', 100, { quantity: 7 }),
  ];
  const points = buildDailyPerformance({
    transactions,
    trackingStartDate: '2026-01-01',
    endDate: '2026-01-07',
    pricesBySymbol: { QA: [
      { date: '2026-01-01', close: 100 },
      { date: '2026-01-04', close: 120 },
      { date: '2026-01-06', close: 100 },
      { date: '2026-01-07', close: 110 },
    ] },
    fxByCurrency: {},
    strict: true,
  });

  // Sale proceeds do not become an invented cash balance in held-securities value.
  assert.deepEqual(Array.from(points, item => item.assetValueKRW), [1000, 1500, 900, 0, 0, 700, 770]);
  assert.deepEqual(Array.from(points, item => item.cumulativeProfitKRW), [0, 0, 0, 180, 180, 180, 250]);
  const series = assertEveryEndpointMatches(points, transactions);
  for (const index of [1, 2]) {
    const metrics = calculatePerformanceMetrics(points, transactions, points[0].date, points[index].date);
    assert.equal(metrics.profitKRW, 0);
    assert.equal(metrics.moneyWeightedReturn, 0);
  }
  for (const index of [3, 4, 5]) {
    const metrics = calculatePerformanceMetrics(points, transactions, points[0].date, points[index].date);
    assert.equal(metrics.profitKRW, 180);
    assert.ok(series[index].portfolioReturn > 0);
  }
  const afterExit = calculatePerformanceMetrics(points, transactions, '2026-01-05', '2026-01-07');
  assert.equal(afterExit.profitKRW, 70);
  assert.equal(assertEveryEndpointMatches(points.slice(4), transactions).at(-1).portfolioReturn, afterExit.moneyWeightedReturn);
});

test('a same-day round trip retains realized profit even when every selected close has no holdings', () => {
  const transactions = [transaction('2026-01-02', 'buy', 100), transaction('2026-01-02', 'sell', 120)];
  const points = buildDailyPerformance({
    transactions,
    trackingStartDate: '2026-01-01',
    endDate: '2026-01-03',
    pricesBySymbol: {},
    fxByCurrency: {},
    strict: true,
  });
  assert.deepEqual(Array.from(points, item => item.assetValueKRW), [0, 0, 0]);
  assert.deepEqual(Array.from(points, item => item.cumulativeProfitKRW), [0, 20, 20]);
  const metrics = calculatePerformanceMetrics(points, transactions, '2026-01-01', '2026-01-03');
  assert.equal(metrics.profitKRW, 20);
  // Daily closing balances cannot provide positive time-weighted capital here.
  assert.equal(metrics.moneyWeightedReturn, null);
  assert.equal(assertEveryEndpointMatches(points, transactions).at(-1).portfolioReturn, null);
});

test('selection excludes start-day flows and includes end-day flows at zero weight', () => {
  const points = [point('2026-01-01', 500), point('2026-01-02', 1000),
    point('2026-01-03', 900), point('2026-01-04', 1010), point('2026-01-05', 2000)];
  const transactions = [transaction('2026-01-01', 'buy', 500), transaction('2026-01-02', 'buy', 500),
    transaction('2026-01-03', 'sell', 100), transaction('2026-01-04', 'buy', 50),
    transaction('2026-01-05', 'buy', 990)];
  const selected = points.slice(1, 4);
  const series = assertEveryEndpointMatches(selected, transactions);
  const metrics = calculatePerformanceMetrics(points, transactions, '2026-01-02', '2026-01-04');
  assert.equal(series[0].portfolioReturn, 0);
  assert.equal(metrics.profitKRW, 60);
  assertClose(metrics.moneyWeightedReturn, 60 / 950 * 100);
  assert.equal(series.at(-1).portfolioReturn, metrics.moneyWeightedReturn);
});

test('empty, single-day and inactive ranges preserve unavailable returns as null', () => {
  assert.deepEqual(Array.from(buildMoneyWeightedReturnSeries([], [])), []);
  assert.equal(calculatePerformanceMetrics([], [], '2026-01-01', '2026-01-03').moneyWeightedReturn, null);
  assert.equal(assertEveryEndpointMatches([point('2026-01-01', 100)], [transaction('2026-01-01', 'buy', 100)])[0].portfolioReturn, 0);
  const inactive = [point('2026-01-01', 0), point('2026-01-02', 0)];
  assert.deepEqual(Array.from(assertEveryEndpointMatches(inactive, []), item => item.portfolioReturn), [null, null]);
  const entering = [...inactive, point('2026-01-03', 100), point('2026-01-04', 110)];
  const entered = assertEveryEndpointMatches(entering, [transaction('2026-01-03', 'buy', 100)]);
  assert.deepEqual(Array.from(entered.slice(0, 3), item => item.portfolioReturn), [null, null, null]);
  assertClose(entered.at(-1).portfolioReturn, 30);
  const exited = assertEveryEndpointMatches([point('2026-01-01', 100), point('2026-01-02', 0), point('2026-01-03', 0)],
    [transaction('2026-01-02', 'sell', 110)]);
  assertClose(exited[1].portfolioReturn, 10);
  assertClose(exited[2].portfolioReturn, 10 / 45 * 100);
});

test('nonpositive denominators and nonfinite calculations never become zero or infinity', () => {
  const points = [point('2026-01-01', 100), point('2026-01-02', 0), point('2026-01-03', 0)];
  for (const sale of [200, 300]) {
    const series = assertEveryEndpointMatches(points, [transaction('2026-01-02', 'sell', sale)]);
    assert.equal(series.at(-1).portfolioReturn, null);
  }
  for (const invalid of [NaN, Infinity, -Infinity]) {
    const invalidStart = [point('2026-01-01', invalid), point('2026-01-03', 110)];
    assert.equal(assertEveryEndpointMatches(invalidStart, []).at(-1).portfolioReturn, null);
    const invalidEnd = [point('2026-01-01', 100), point('2026-01-03', invalid)];
    assert.equal(assertEveryEndpointMatches(invalidEnd, []).at(-1).portfolioReturn, null);
    assert.equal(assertEveryEndpointMatches(points, [transaction('2026-01-02', 'buy', invalid)]).at(-1).portfolioReturn, null);
  }
  const overflow = [point('2026-01-01', 0.1), point('2026-01-03', Number.MAX_VALUE)];
  assert.equal(assertEveryEndpointMatches(overflow, []).at(-1).portfolioReturn, null);
});

test('series converts each selected transaction once even for a long selected period', () => {
  const points = Array.from({ length: 1000 }, (_, index) => point(addCalendarDays('2020-01-01', index), 100000 + index));
  let priceReads = 0;
  const transactions = Array.from({ length: 200 }, (_, index) => ({
    ...transaction(addCalendarDays('2020-01-01', index + 1), 'buy', 1),
    get price() { priceReads++; return 1; },
  }));
  const series = buildMoneyWeightedReturnSeries(points, transactions);
  assert.equal(series.length, 1000);
  assert.equal(priceReads, transactions.length);
  const metrics = calculatePerformanceMetrics(points, transactions, points[0].date, points.at(-1).date);
  assert.equal(series.at(-1).portfolioReturn, metrics.moneyWeightedReturn);
});

function cashlessHistory(transactions, prices, endDate, fxByCurrency = {}) {
  return buildDailyPerformance({ transactions, trackingStartDate: transactions.map(tx => tx.date).sort()[0],
    endDate, pricesBySymbol: prices, fxByCurrency, strict: true });
}

function assertSecuritiesEndpoints(points, transactions) {
  const series = buildSecuritiesReturnSeries(points, transactions);
  for (let index = 0; index < points.length; index++) {
    const metrics = calculatePerformanceMetrics(points, transactions, points[0].date, points[index].date);
    assert.equal(series[index].portfolioReturn, metrics.securitiesReturn);
    assert.equal(series[index].periodProfitKRW, metrics.profitKRW);
  }
  return series;
}

test('cashless purchase, double, complete sale leaves zero holdings and keeps the million-won gain', () => {
  const trades = [transaction('2026-01-01', 'buy', 1_000_000), transaction('2026-01-03', 'sell', 2_000_000)];
  const points = cashlessHistory(trades, { QA: [{date:'2026-01-01',close:1_000_000},{date:'2026-01-02',close:2_000_000}] }, '2026-01-06');
  assert.deepEqual(Array.from(points,p=>p.assetValueKRW),[1_000_000,2_000_000,0,0,0,0]);
  assert.deepEqual(Array.from(points,p=>p.cumulativeProfitKRW),[0,1_000_000,1_000_000,1_000_000,1_000_000,1_000_000]);
  assert.deepEqual(Array.from(assertSecuritiesEndpoints(points,trades),p=>p.portfolioReturn),[0,100,100,100,100,100]);
  const onlyAfterSale=calculatePerformanceMetrics(points,trades,'2026-01-04','2026-01-06');
  assert.equal(onlyAfterSale.profitKRW,0);assert.equal(onlyAfterSale.securitiesReturn,null);
});

test('cashless added capital and subsequent flat days cannot change an earned ten percent', () => {
  const trades=[transaction('2026-01-01','buy',1_000_000),transaction('2026-01-03','buy',1_000_000,{symbol:'OTHER'})];
  const points=cashlessHistory(trades,{QA:[{date:'2026-01-01',close:1_000_000},{date:'2026-01-02',close:1_100_000}],OTHER:[{date:'2026-01-03',close:1_000_000}]},'2026-01-08');
  const series=assertSecuritiesEndpoints(points,trades);
  assert.equal(points.at(-1).assetValueKRW,2_100_000);
  for(const p of series.slice(1)){assertClose(p.portfolioReturn,10);assert.equal(p.periodProfitKRW,100_000);}
});

test('cashless first-day gain and both transaction fees remain in lifetime profit', () => {
  const trades=[transaction('2026-01-01','buy',100,{fee:2}),transaction('2026-01-02','sell',120,{fee:3})];
  const points=cashlessHistory(trades,{QA:[{date:'2026-01-01',close:110}]},'2026-01-04');
  const series=assertSecuritiesEndpoints(points,trades);
  assert.equal(points[0].openingValueKRW,0);assert.equal(points[0].netFlowKRW,102);
  assert.equal(series[0].periodProfitKRW,8);assertClose(series[0].portfolioReturn,8/102*100);
  assert.equal(series.at(-1).periodProfitKRW,15);assertClose(series.at(-1).portfolioReturn,15/102*100);
});

test('cashless same-day round trip uses recorded fills without market prices and includes start-date trades', () => {
  const trades=[transaction('2026-01-01','buy',100,{fee:1}),transaction('2026-01-01','sell',120,{fee:2})];
  const points=cashlessHistory(trades,{},'2026-01-03');
  const series=assertSecuritiesEndpoints(points,trades);
  assert.deepEqual(Array.from(points,p=>p.assetValueKRW),[0,0,0]);
  for(const p of series){assert.equal(p.periodProfitKRW,17);assertClose(p.portfolioReturn,17/101*100);}
});

test('cashless partial sales and re-entry preserve gains and compound only invested days', () => {
  const trades=[transaction('2026-01-01','buy',100,{quantity:10}),
    transaction('2026-01-02','sell',110,{quantity:5}),transaction('2026-01-03','sell',120,{quantity:5}),
    transaction('2026-01-06','buy',100,{quantity:2})];
  const points=cashlessHistory(trades,{QA:[{date:'2026-01-01',close:100},{date:'2026-01-02',close:110},{date:'2026-01-03',close:120},{date:'2026-01-06',close:110}]},'2026-01-08');
  const series=assertSecuritiesEndpoints(points,trades);
  assert.equal(series[2].periodProfitKRW,150);assertClose(series[2].portfolioReturn,20);
  assertClose(series[4].portfolioReturn,20);assertClose(series[5].portfolioReturn,32);
  assert.equal(series.at(-1).periodProfitKRW,170);
  const entryOnly=calculatePerformanceMetrics(points,trades,'2026-01-06','2026-01-08');
  assert.equal(entryOnly.profitKRW,20);assertClose(entryOnly.securitiesReturn,10);
});

test('cashless selected dates include their trading day and use the prior closing holdings value', () => {
  const trades=[transaction('2026-01-01','buy',100),transaction('2026-01-03','sell',150)];
  const points=cashlessHistory(trades,{QA:[{date:'2026-01-01',close:110},{date:'2026-01-02',close:120}]},'2026-01-04');
  const onlySale=calculatePerformanceMetrics(points,trades,'2026-01-03','2026-01-03');
  assert.equal(onlySale.startValueKRW,120);assert.equal(onlySale.endValueKRW,0);
  assert.equal(onlySale.profitKRW,30);assertClose(onlySale.securitiesReturn,25);
  const selected=assertSecuritiesEndpoints(points.slice(1),trades);
  assert.equal(selected.at(-1).periodProfitKRW,40);assertClose(selected.at(-1).portfolioReturn,150/110*100-100);
});

test('cashless foreign fills retain transaction FX and evaluate only remaining shares at daily FX', () => {
  const trades=[transaction('2026-01-01','buy',100,{currency:'USD',fxRateToKRW:1300}),
    transaction('2026-01-02','sell',120,{currency:'USD',fxRateToKRW:1400})];
  const before=structuredClone(trades);
  const points=cashlessHistory(trades,{QA:[{date:'2026-01-01',close:110}]},'2026-01-03',{USD:[{date:'2026-01-01',close:1350}]});
  const series=assertSecuritiesEndpoints(points,trades);
  assert.equal(series[0].periodProfitKRW,18500);
  assert.equal(series.at(-1).periodProfitKRW,38000);assertClose(series.at(-1).portfolioReturn,38000/130000*100);
  assert.deepEqual(trades,before);
});

test('cashless zero-capital days are unavailable while a total loss is not reset by re-entry', () => {
  const points=[{...point('2026-01-01',100),openingValueKRW:100},{...point('2026-01-02',0),openingValueKRW:100},
    {...point('2026-01-03',0),openingValueKRW:0},{...point('2026-01-04',110),openingValueKRW:0}];
  const trades=[transaction('2026-01-04','buy',100)];
  assert.deepEqual(Array.from(assertSecuritiesEndpoints(points,trades),p=>p.portfolioReturn),[0,-100,-100,-100]);
  assertClose(calculatePerformanceMetrics(points,trades,'2026-01-04','2026-01-04').securitiesReturn,10);
  const empty=[{...point('2026-01-01',0),openingValueKRW:0}];
  assert.equal(assertSecuritiesEndpoints(empty,[])[0].portfolioReturn,null);
});

test('cashless invalid capital or returns cannot silently become a valid percentage', () => {
  for(const bad of [NaN,Infinity,-1]){
    const points=[{...point('2026-01-01',100),openingValueKRW:100}, {...point('2026-01-02',bad),openingValueKRW:100}];
    assert.equal(buildSecuritiesReturnSeries(points,[]).at(-1).portfolioReturn,null);
  }
});

test('a truncated legacy history does not invent its missing first opening valuation',()=>{
  const trades=[transaction('2026-01-01','buy',100),transaction('2026-01-03','buy',50,{quantity:1})];
  const points=buildDailyPerformance({transactions:trades,trackingStartDate:'2026-01-03',endDate:'2026-01-04',
    pricesBySymbol:{QA:[{date:'2026-01-03',close:70}]},fxByCurrency:{},strict:true});
  assert.equal(points[0].openingValueKRW,undefined);assert.equal(points[0].cumulativeProfitKRW,0);
  assert.equal(points[0].netFlowKRW,0);
  const series=assertSecuritiesEndpoints(points,trades);
  assert.deepEqual(Array.from(series,p=>p.portfolioReturn),[0,0]);
  assert.equal(series.at(-1).periodProfitKRW,0);
});
