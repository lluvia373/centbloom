import test from 'node:test';
import assert from 'node:assert/strict';
import { dividendCollectors, refreshDividendSources } from '../scripts/refresh-dividends.mjs';

test('public-source refresh continues past a failed provider and reports failure without retrying all sources', async () => {
  const called = [];
  const results = await refreshDividendSources(async file => {
    called.push(file);
    if (called.length === 2) throw Error('provider failed');
    return 0;
  });
  assert.deepEqual(called, dividendCollectors);
  assert.deepEqual(results.map(row => row.code), [0, 1, 0, 0]);
});
