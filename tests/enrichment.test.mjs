import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTypescript} from './load-typescript.mjs';
const record={id:'00000000-0000-4000-8000-000000000001',symbol:'QA',name:'QA',type:'buy',date:'2020-01-01',quantity:1,price:100,fee:0,currency:'USD',fxRateToKRW:1234,createdAt:'2020-01-01T00:00:00Z'};
test('enrichment preserves recorded FX and shares the USD request; date changes refetch only the edited record',async()=> {
 const calls=[];const api={getQuote:async symbol=>{calls.push(symbol);return {currency:'USD'}},getFxRateToKRW:async(currency,date)=>{calls.push([currency,date]);return 1300;}};
 const {prepareTransactions}=loadTypescript('src/features/portfolio/model/enrichment.ts',{'@/lib/stock-api':api});
 const enriched=await prepareTransactions([record],{type:'enrich'},[record]);assert.equal(enriched[0].fxRateToKRW,1234);assert.equal(calls.length,1);
 calls.length=0;await prepareTransactions(enriched,{type:'update',id:record.id,changes:{date:record.date}},enriched);assert.equal(calls.length,0);
 const changed={...enriched[0],date:'2020-01-02'};await prepareTransactions([changed],{type:'update',id:record.id,changes:{date:changed.date}},enriched);assert.deepEqual(calls,[['USD','2020-01-02']]);
});
test('known foreign FX and USD start without waiting for each other',async()=> {
 const calls=[];let release;const usd=new Promise(r=>release=r);
 const {prepareTransactions}=loadTypescript('src/features/portfolio/model/enrichment.ts',{'@/lib/stock-api':{getQuote:async()=>({currency:'JPY'}),getFxRateToKRW:(currency)=>{calls.push(currency);return currency==='USD'?usd:Promise.resolve(9)}}});
 const pending=prepareTransactions([{...record,currency:'JPY',fxRateToKRW:undefined}],{type:'enrich'},[]);await new Promise(r=>setTimeout(r,0));assert.deepEqual(calls,['USD','JPY']);release(1300);await pending;
});
