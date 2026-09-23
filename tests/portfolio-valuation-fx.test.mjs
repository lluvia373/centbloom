import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadTypescript } from './load-typescript.mjs';

const now = Date.parse('2026-09-22T17:00:00Z');
const transaction = { id: 'cny', symbol: '300750.SZ', name: 'CATL', type: 'buy', date: '2026-09-01', quantity: 1,
  price: 100, fee: 0, currency: 'CNY', fxRateToKRW: 190, usdKrwRateAtTransaction: 1400, createdAt: '2026-09-01T01:00:00Z' };
const quote = (symbol, price, currency, at = now - 30 * 60000, fx) => ({ symbol, name: symbol, price, currency,
  quotedAt: new Date(at).toISOString(), fetchedAt: new Date(now).toISOString(), marketState: 'REGULAR', fx });
const baseQuotes = () => ({ '300750.SZ': quote('300750.SZ', 200, 'CNY'),
  'CNYKRW=X': quote('CNYKRW=X', 200, 'KRW', undefined, { method: 'direct', components: [], valuationOnly: true }),
  'USDKRW=X': quote('USDKRW=X', 1400, 'KRW', now - 60000) });

function market({ transactions = [transaction], quotes = baseQuotes(), checkedAt = now, currency = 'KRW', failed = [] } = {}) {
  let state;
  const { PortfolioMarketProvider } = loadTypescript('src/features/portfolio/state/market.tsx', {
    react: { ...React, useMemo: fn => fn(), createContext: () => ({ Provider: ({ value, children }) => { state = value; return children; } }) },
    'next/navigation': { usePathname: () => '/portfolio' },
    './ledger': { useTransactions: () => ({ transactions, status: 'ready', revision: 'r1' }) },
    './preferences': { usePreferences: () => ({ displayCurrency: currency }) },
    '@/hooks/useLiveQuotes': { useLiveQuotes: () => ({ quotes, checkedAt, failedSymbols: failed, loading: false, refresh: async () => {} }) },
  });
  renderToStaticMarkup(createElement(PortfolioMarketProvider));
  return state;
}

test('valuation fallback retains total, gain and denominator with the actual observation time', () => {
  const state = market();
  assert.equal(state.summary.totalValue, 40000);
  assert.equal(state.summary.holdings[0].valuationAvailable, true);
  assert.equal(state.summary.holdings[0].gainAvailable, true);
  assert.match(state.valuationFxNotice, /환율 지연.*CNY\/KRW.*9\. 23\. 01:30.*기준/);
  assert.doesNotMatch(state.valuationFxNotice, /02:00|USD|추정/);
  const { PortfolioMetrics } = loadTypescript('src/components/PortfolioMetrics.tsx', { '@/hooks/usePortfolio': {
    usePreferences: () => ({ displayCurrency: 'KRW' }), usePortfolioMarket: () => state,
    usePortfolioDailyChange: () => ({ available: false, bySymbol: {}, reason: 'CNY/KRW 현재 환율을 확인하지 못했습니다' }),
  } });
  const html = renderToStaticMarkup(createElement(PortfolioMetrics));
  assert.match(html, /₩40,000/);
  assert.equal(html.split('환율 지연').length - 1, 1);
  assert.match(html, /오늘 손익<\/dt><dd[^>]*>—<\/dd>/);
});

test('missing, future, wrong-pair and expired FX never manufacture an available valuation', () => {
  for (const change of [null, { quotedAt: new Date(now + 1).toISOString() },
    { quotedAt: new Date(now - 7 * 86400000 - 1).toISOString() }, { symbol: 'CNHKRW=X' }, { currency: 'USD' }]) {
    const quotes = baseQuotes();
    if (change) quotes['CNYKRW=X'] = { ...quotes['CNYKRW=X'], ...change };
    else delete quotes['CNYKRW=X'];
    const state = market({ quotes });
    assert.equal(state.summary.holdings[0].valuationAvailable, false);
    assert.equal(state.valuationFxNotice, null);
  }
});

test('a retained quote on failed refresh is labelled then expires against the new check time', () => {
  const quotes = baseQuotes();
  quotes['CNYKRW=X'].fx = undefined;
  const state = market({ quotes, failed: ['CNYKRW=X'] });
  assert.equal(state.summary.holdings[0].valuationAvailable, true);
  assert.match(state.valuationFxNotice, /CNY\/KRW/);
  assert.ok(state.marketDataError);
  const expired = market({ quotes, checkedAt: now + 7 * 86400000 });
  assert.equal(expired.summary.holdings[0].valuationAvailable, false);
});

test('fresh recovery, unused FX, USD-only display and empty holdings do not show a delay note', () => {
  const quotes = baseQuotes();
  quotes['CNYKRW=X'] = quote('CNYKRW=X', 201, 'KRW', now - 60000);
  assert.equal(market({ quotes }).valuationFxNotice, null);
  assert.equal(market({ transactions: [] }).valuationFxNotice, null);
  const usdTrade = { ...transaction, symbol: 'AAPL', currency: 'USD' };
  quotes.AAPL = quote('AAPL', 110, 'USD');
  quotes['USDKRW=X'] = quote('USDKRW=X', 1400, 'KRW');
  assert.equal(market({ transactions: [usdTrade], quotes, currency: 'USD' }).valuationFxNotice, null);
  const krTrade = { ...transaction, symbol: '005930.KS', currency: 'KRW' };
  quotes['005930.KS'] = quote('005930.KS', 100, 'KRW');
  assert.equal(market({ transactions: [krTrade], quotes }).valuationFxNotice, null);
  assert.match(market({ transactions: [krTrade], quotes, currency: 'USD' }).valuationFxNotice, /USD\/KRW/);
});

test('historical current USD conversion remains strict independently of the holding valuation', () => {
  const quotes = baseQuotes();
  quotes['USDKRW=X'] = quote('USDKRW=X', 1400, 'KRW', undefined,
    { method: 'direct', components: [], valuationOnly: true });
  const state = market({ quotes, currency: 'USD' });
  assert.equal(state.summary.holdings[0].valuationAvailable, true);
  assert.equal(state.currentUsdKrwRate, null);
  quotes['USDKRW=X'] = quote('USDKRW=X', 1401, 'KRW', now - 60000);
  assert.equal(market({ quotes }).currentUsdKrwRate, 1401);
});
