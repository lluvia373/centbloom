import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadTypescript } from './load-typescript.mjs';

const stock = { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NMS', type: 'EQUITY' };
const secondStock = { ...stock, symbol: 'MSFT' };
const user = { id: 'user-a', email: 'a@example.com' };
const validMarket = { symbol: 'AAPL', date: '2026-09-22', quote: { currency: 'USD' }, fx: 1400, usdKrw: 1400 };
const format = { todayISO: () => '2026-09-22', formatCurrency: (value, currency) => `${currency} ${value}` };
const submit = { preventDefault() {} };

function harness({ save = async () => null, marketState } = {}) {
  const slots = [];
  let cursor = 0, generation = 0;
  const calls = [];
  const { useTransactionEntry } = loadTypescript('src/features/portfolio/ui/use-transaction-entry.ts', {
    react: {
      useState(initial) {
        const i = cursor++;
        if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
        return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }];
      },
      useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    },
    '@/hooks/useAuth': { useAuth: () => ({ user }) },
    '@/hooks/usePortfolio': {
      useTransactions: () => ({ transactions: [] }),
      useTransactionCommands: () => ({ addTransaction: async input => { calls.push(input); return save(input); } }),
    },
    '@/shared/react/use-operation-scope': { useOperationScope: () => () => { const token = generation; return () => token === generation; } },
    '@/features/market/use-trade-market': { useTradeMarket: (symbol, date) => marketState ?? {
      market: { ...validMarket, symbol, date }, marketLoading: false, marketError: null,
    } },
    '@/lib/portfolio': { getAvailableQuantity: () => 3 },
    '@/lib/markets': { discoveryStocks: () => [stock, secondStock] },
    '@/lib/format': format,
  });
  return { calls, switchAccount: () => generation++, render() { cursor = 0; return useTransactionEntry('AAPL'); } };
}

test('extracted entry preserves numeric validation and never calls storage for invalid input', async () => {
  for (const [quantity, price, fee, message] of [
    ['', '100', '', /수량과 체결/], ['0', '100', '', /수량과 체결/], ['-1', '100', '', /수량과 체결/],
    ['Infinity', '100', '', /수량과 체결/], ['2', 'no price', '', /수량과 체결/], ['2', '0', '', /수량과 체결/],
    ['2', '100', '-1', /수수료/], ['2', '100', 'Infinity', /수수료/],
  ]) {
    const h = harness(); const entry = h.render();
    entry.setQuantity(quantity); entry.setPrice(price); entry.setFee(fee);
    await h.render().handleSubmit(submit);
    assert.equal(h.calls.length, 0);
    assert.match(h.render().error, message);
    assert.equal(h.render().saving, false);
  }
});

test('date, trade type, price and original market rates reach the existing command unchanged', async () => {
  const h = harness(); let entry = h.render();
  entry.setQuantity('2.5'); entry.setPrice('123.45'); entry.setFee('1');
  entry.setDate('2026-09-01'); entry.setRecordDate(true); entry.setTxType('sell');
  await h.render().handleSubmit(submit);
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0])), {
    symbol: 'AAPL', name: 'Apple Inc.', type: 'sell', date: '2026-09-01', quantity: 2.5, price: 123.45,
    fee: 1, currency: 'USD', fxRateToKRW: 1400, usdKrwRateAtTransaction: 1400,
  });
  entry = h.render();
  assert.equal(entry.success, true); assert.equal(entry.quantity, ''); assert.equal(entry.fee, '');
  assert.equal(entry.price, '123.45'); assert.equal(entry.date, '2026-09-01');
  entry.setQuantity('1'); entry.setRecordDate(false);
  await h.render().handleSubmit(submit);
  assert.equal(h.calls[1].date, '2026-09-22'); assert.equal(h.calls[1].fee, 0);
});

test('pending save blocks duplicate submits and stock changes; account switch cannot publish old success', async () => {
  let finish;
  const h = harness({ save: () => new Promise(resolve => { finish = resolve; }) });
  let entry = h.render(); entry.setQuantity('2'); entry.setPrice('100');
  entry = h.render(); const first = entry.handleSubmit(submit);
  await entry.handleSubmit(submit); entry.chooseStock(secondStock);
  assert.equal(h.calls.length, 1); assert.equal(h.render().selected.symbol, 'AAPL'); assert.equal(h.render().saving, true);
  h.switchAccount(); finish(null); await first;
  assert.equal(h.render().success, false); assert.equal(h.render().quantity, '2');
});

test('save failure retains the draft, and stale or loading market input never saves', async () => {
  const h = harness({ save: async () => '저장 실패' });
  let entry = h.render(); entry.setQuantity('2'); entry.setPrice('100'); entry.setFee('1');
  await h.render().handleSubmit(submit); entry = h.render();
  assert.equal(entry.error, '저장 실패'); assert.equal(entry.quantity, '2'); assert.equal(entry.fee, '1');
  assert.equal(entry.success, false); assert.equal(entry.saving, false);
  for (const marketState of [
    { market: { ...validMarket, symbol: 'MSFT' }, marketLoading: false },
    { market: { ...validMarket, date: '2026-09-21' }, marketLoading: false },
    { market: validMarket, marketLoading: true },
    { market: null, marketLoading: false },
  ]) {
    const blocked = harness({ marketState }); const draft = blocked.render(); draft.setQuantity('2'); draft.setPrice('100');
    await blocked.render().handleSubmit(submit); assert.equal(blocked.calls.length, 0);
  }
});

test('account key remains on the form session and forces a fresh draft for another account', () => {
  let currentUser = user;
  const { TransactionForm } = loadTypescript('src/components/TransactionForm.tsx', {
    '@/hooks/useAuth': { useAuth: () => ({ user: currentUser }) },
    '@/features/portfolio/ui/use-transaction-entry': { useTransactionEntry() { throw new Error('wrapper must not run entry'); } },
    '@/features/portfolio/ui/TradeStockPicker': { TradeStockPicker: () => null },
  });
  assert.equal(TransactionForm({ initialSymbol: 'AAPL' }).key, 'user-a');
  currentUser = { id: 'user-b' }; assert.equal(TransactionForm({}).key, 'user-b');
  currentUser = null; assert.equal(TransactionForm({}).key, 'guest');
});

test('all five representative HTML outputs match the before-extraction screen byte for byte', () => {
  // Captured from the dirty working copy immediately before extraction, including its account confirmation.
  const cases = [
    ['empty', [null,'buy','',false,'','','',null,false,0,false], {market:null,marketLoading:false,marketError:null}, '1d4deb7cbf3d85a270f99a7e585f40950aa402fc1606cb1a352ae7681bdd0d6a'],
    ['buy', [stock,'buy','2026-09-22',true,'123.45','2.5','1',null,false,0,false], {market:validMarket,marketLoading:false,marketError:null}, '98a620e0a071da24d5656fe62b06caeec06ba2e39cc70a1cb47716aaeddfce46'],
    ['sell-error', [stock,'sell','',false,'123.45','2.5','1','저장 실패',false,0,false], {market:null,marketLoading:false,marketError:'환율 조회 실패'}, 'f16407eff80ebcc0f9b60db029b040f5ba0e79f2cef74d23939abe72aede55b8'],
    ['success', [stock,'sell','',false,'123.45','','',null,true,0,false], {market:validMarket,marketLoading:false,marketError:null}, 'dc8bfbe118b183cb67b4ee6b71e42388471471d0af0461c7e490a558640df518'],
    ['saving', [stock,'buy','',false,'123.45','2.5','1',null,false,0,true], {market:validMarket,marketLoading:false,marketError:null}, 'c0aa079c53208b5831676d757f9195051dab8ffb880aaef260538dd296dfbf91'],
  ];
  for (const [name, states, marketState, expected] of cases) {
    let cursor = 0;
    const { TransactionForm } = loadTypescript('src/components/TransactionForm.tsx', {
      react: { ...React, useState: () => [states[cursor++], () => {}] },
      '@/hooks/useAuth': { useAuth: () => ({ user }) },
      '@/hooks/usePortfolio': { useTransactions: () => ({transactions:[]}), useTransactionCommands: () => ({addTransaction:async()=>null}) },
      '@/shared/react/use-operation-scope': {useOperationScope:()=>()=>()=>true},
      '@/features/market/use-trade-market': {useTradeMarket:()=>marketState},
      '@/lib/portfolio': {getAvailableQuantity:()=>3},
      '@/lib/format': format,
      '@/features/portfolio/ui/TradeStockPicker': {TradeStockPicker:()=>React.createElement('div',{'data-picker':true})},
      'next/link': {__esModule:true,default:({children,...props})=>React.createElement('a',props,children)},
    });
    const html = renderToStaticMarkup(React.createElement(TransactionForm));
    assert.equal(createHash('sha256').update(html).digest('hex'), expected, name);
  }
});
