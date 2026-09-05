import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTypescript} from './load-typescript.mjs';

test('both holding actions expose per-trade removal and keep whole-holding deletion behind a separate confirmation',()=> {
 const records=[{id:'buy-one',symbol:'AAPL'},{id:'buy-two',symbol:'AAPL'},{id:'other',symbol:'MSFT'}];
 const removeTransaction=()=>{},removeHolding=()=>{};
 let list;
 const {HoldingManagement}=loadTypescript('src/components/HoldingManagement.tsx',{
  '@/hooks/usePortfolio':{useTransactions:()=>({transactions:records}),useTransactionCommands:()=>({removeTransaction,removeHolding,updateTransaction:()=>{},restoreTransaction:()=>{}})},
  './TransactionList':{TransactionList:props=>{list=props;return null;}},
 });
 for(const action of ['edit','delete']){
  const html=renderToStaticMarkup(createElement(HoldingManagement,{target:{symbol:'AAPL',name:'Apple',action},onClose:()=>{}}));
  assert.deepEqual(list.transactions.map(t=>t.id),['buy-one','buy-two']);
  assert.equal(list.onRemove,removeTransaction);assert.notEqual(list.onRemove,removeHolding);
  assert.equal(typeof list.onDeleted,'function');assert.equal(list.initialEditId,undefined);
  assert.match(html,/전체 거래 삭제/);assert.doesNotMatch(html,/<dialog[^>]*\sopen(?:[\s=>])/);
 }
});
