import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTypescript} from './load-typescript.mjs';

function render(quotes={},failedSymbols=[]) {
 let subscribed;
 const {MarketTicker}=loadTypescript('src/features/market/MarketTicker.tsx',{
  '@/hooks/useLiveQuotes':{useLiveQuotes: symbols=>{subscribed=Array.from(symbols);return {quotes,failedSymbols};}},
  './MarketTicker.module.css':{default:{up:'up',down:'down',flat:'flat'}},
 });
 return {html:renderToStaticMarkup(createElement(MarketTicker)),symbols:subscribed};
}

test('index strip requests the exact indices and never invents prices during loading or failure',()=>{
 const {html,symbols}=render({},['^KS11']);
 assert.deepEqual(symbols,['^GSPC','^IXIC','^DJI','^VIX','^KS11','^KQ11','KRW=X']);
 assert.match(html,/조회 불가/);
 assert.match(html,/시세 불러오는 중/);
 assert.doesNotMatch(html,/<strong/);
 assert.match(html,/좌우로 스크롤/);
});

test('index strip distinguishes gains, losses, flat prices and failed refreshes with quote timestamps',()=>{
 const quote={price:1234.56,changePercent:1.23,quotedAt:'2026-09-04T06:30:00Z',marketState:'CLOSED',delayMinutes:20};
 const {html}=render({'^KS11':quote,'^KQ11':{...quote,changePercent:-2.34},'^GSPC':{...quote,changePercent:0},'KRW=X':quote},['^KS11']);
 assert.match(html,/1,234.56/);
 assert.match(html,/\+1.23%/);
 assert.match(html,/-2.34%/);
 assert.match(html,/0.00%/);
 assert.match(html,/갱신 실패, 이전 가격/);
 assert.match(html,/장 마감 · 20분 지연 · 9\. 4\. 15:30 KST 기준/);
 assert.match(html,/>이전</);
 assert.match(html,/USD\/KRW/);
});

