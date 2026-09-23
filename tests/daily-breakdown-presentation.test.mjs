import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescript } from './load-typescript.mjs';

const { getDailyBreakdownDisplay } = loadTypescript('src/features/portfolio/ui/daily-breakdown-presentation.ts');

function minorUnits(value, currency) {
  const digits = currency === 'KRW' ? 0 : 2;
  const parts = new Intl.NumberFormat('ko-KR', {
    style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).formatToParts(value);
  const magnitude = Number(parts.filter(part => part.type === 'integer' || part.type === 'fraction')
    .map(part => part.value).join(''));
  return magnitude === 0 ? 0 : value < 0 ? -magnitude : magnitude;
}

function check(change, stock, fx, currency, expected) {
  const result = getDailyBreakdownDisplay(change, stock, fx, currency);
  assert.deepEqual({ ...result }, expected);
  assert.equal(minorUnits(result.total, currency), minorUnits(change, currency), 'total keeps normal currency rounding');
  assert.equal(minorUnits(result.stock, currency) + minorUnits(result.fx, currency), minorUnits(result.total, currency),
    'visible components add up in integer currency units');
  for (const value of Object.values(result)) assert.equal(Object.is(value, -0), false);
}

test('mixed signs with a negative KRW total show stock + FX = total', () => {
  check(-99_835.71, 87_862.31, -187_698.02, 'KRW', { total: -99_836, stock: 87_862, fx: -187_698 });
  check(12.2, -8.2, 20.4, 'USD', { total: 12.2, stock: -8.2, fx: 20.4 });
});

test('positive components assign their one-won rounding residual to FX', () => {
  check(300.8, 100.4, 200.4, 'KRW', { total: 301, stock: 100, fx: 201 });
  check(1, 0.5, 0.5, 'KRW', { total: 1, stock: 1, fx: 0 });
});

test('negative components match Intl half-away-from-zero rounding', () => {
  check(-1.5, -0.5, -1, 'KRW', { total: -2, stock: -1, fx: -1 });
  check(-300.8, -100.4, -200.4, 'KRW', { total: -301, stock: -100, fx: -201 });
});

test('USD amounts preserve decimal Intl rounding rather than binary Math.round rounding', () => {
  check(1.01, 1.005, 0.005, 'USD', { total: 1.01, stock: 1.01, fx: 0 });
  check(-1.01, -1.005, -0.005, 'USD', { total: -1.01, stock: -1.01, fx: 0 });
  check(10.008, 4.004, 6.004, 'USD', { total: 10.01, stock: 4, fx: 6.01 });
});

test('zero and tiny components have no signed zero or invented opposing values', () => {
  check(0, -0, 0, 'KRW', { total: 0, stock: 0, fx: 0 });
  check(-0.1, -0.2, 0.1, 'KRW', { total: 0, stock: 0, fx: 0 });
  check(0.002, 0.004, -0.002, 'USD', { total: 0, stock: 0, fx: 0 });
  check(0.01, 0.5, -0.49, 'KRW', { total: 0, stock: 0, fx: 0 });
  check(-0.001, -0.005, 0.004, 'USD', { total: 0, stock: 0, fx: 0 });
});

test('rounding does not turn an FX value below display precision into an opposing profit or loss', () => {
  check(1.4, 1.5, -0.1, 'KRW', { total: 1, stock: 1, fx: 0 });
  check(-1.4, -1.5, 0.1, 'KRW', { total: -1, stock: -1, fx: 0 });
  check(2.331, 2.335, -0.004, 'USD', { total: 2.33, stock: 2.33, fx: 0 });
});

test('genuine opposing contributions remain visible even when their total is zero', () => {
  check(0, 25.6, -25.6, 'KRW', { total: 0, stock: 26, fx: -26 });
  check(0, 0.02, -0.02, 'USD', { total: 0, stock: 0.02, fx: -0.02 });
});

test('a tiny combined gain or loss stays visible when the total rounds to a currency unit', () => {
  check(0.8, 0.4, 0.4, 'KRW', { total: 1, stock: 0, fx: 1 });
  check(-0.008, -0.004, -0.004, 'USD', { total: -0.01, stock: 0, fx: -0.01 });
});

test('invalid numbers and amounts beyond safe integer currency units are rejected rather than shown as zero', () => {
  for (const invalid of [NaN, Infinity, -Infinity]) {
    assert.throws(() => getDailyBreakdownDisplay(invalid, 1, 2, 'KRW'), { name: 'TypeError' });
    assert.throws(() => getDailyBreakdownDisplay(3, invalid, 2, 'KRW'), { name: 'TypeError' });
    assert.throws(() => getDailyBreakdownDisplay(3, 1, invalid, 'KRW'), { name: 'TypeError' });
  }
  assert.throws(() => getDailyBreakdownDisplay(Number.MAX_VALUE, 1, 2, 'USD'), { name: 'RangeError' });
});
