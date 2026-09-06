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
 assert.deepEqual(symbols,['^GSPC','^IXIC','^NDX','^DJI','^RUT','^SOX','^VIX','^KS11','^KQ11','^N225','^HSI','000001.SS','^STOXX50E','^GDAXI','^FTSE','^TNX','DX-Y.NYB','KRW=X']);
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

test("Treasury yield uses percent and basis points; scrolling duplicate is inert",()=>{
 const {formatTickerQuote}=loadTypescript("src/features/market/ticker-instruments.ts");
 const value=formatTickerQuote("^TNX",{price:4.784,change:0.022,changePercent:0.46});
 assert.equal(value.price,"4.784%");assert.equal(value.change,"+2.20bp");
 assert.equal(formatTickerQuote("^TNX",{price:4.76,change:-0.01,changePercent:-0.21}).change,"-1.00bp");
 const {html,symbols}=render();assert.equal(new Set(symbols).size,18);
 assert.match(html,/<ul[^>]*aria-hidden="true"[^>]*inert=""/);
 assert.doesNotMatch(html,/시세 흐름 일시정지|시세 흐름 재생|<button/);
});
