// Isolated test data only. Never imported by the application or copied into public data.
import { companyDatasets } from '../../src/features/market/company-data.ts';
import { normalizeFmp } from '../../src/features/market/server/fmp.ts';
export function companyFixture(state = 'received') {
  const at = '2026-09-24T10:00:00.000Z';
  const missing = { status: 'failed', attemptedAt: at, receivedAt: null, rows: [], issue: 'missing-key', completeness: 'unverified' };
  const datasets = Object.fromEntries(companyDatasets.map(name => [name, { ...missing }]));
  const inputs = {
    dividends: [{ symbol: 'TEST', date: '2026-08-10', dividend: .27, currency: 'USD', paymentDate: '2026-08-13' }],
    earnings: [
      { symbol: 'TEST', date: '2027-01-30', epsEstimated: 3.1, currency: 'USD' },
      { symbol: 'TEST', date: '2026-10-30', epsEstimated: 2.1, currency: 'USD' },
      { symbol: 'TEST', date: '2026-07-30', epsActual: 0, epsEstimated: 2.0, revenueActual: 125000000000, currency: 'USD' },
      { symbol: 'TEST', date: '2026-04-30', epsActual: 1.4, epsEstimated: 1.5 },
    ],
  };
  for (const name of ['dividends', 'earnings']) datasets[name] = {
    status: state === 'stale' ? 'failed' : state === 'empty' ? 'empty-unverified' : 'received',
    attemptedAt: at, receivedAt: '2026-09-23T10:00:00.000Z', issue: state === 'stale' ? 'request-failed' : null,
    completeness: 'unverified', rows: state === 'empty' ? [] : normalizeFmp(name, 'TEST', inputs[name], at),
  };
  return { version: 1, provider: 'fmp', symbol: 'TEST', usage: 'local-evaluation', updatedAt: at, realtimeVerified: false, datasets };
}
