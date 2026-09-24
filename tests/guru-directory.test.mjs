import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {loadTypescript} from './load-typescript.mjs';
const model=loadTypescript('src/features/gurus/list-model.ts');
const registry=JSON.parse(readFileSync('src/features/gurus/registry.json','utf8'));
const {guruCatalog}=loadTypescript('src/features/gurus/catalog.ts');
const base=model.summarizeGuru(guruCatalog[0],guruCatalog[0].archive.versions.at(-1));

test('all registered managers can be searched in Korean or English without inventing holdings',()=>{
 const all=registry.map((guru,index)=>({...base,...guru,valueUsd:index+1}));
 assert.equal(model.selectGurus(all,'버핏','popular')[0].slug,'berkshire-hathaway');
 assert.equal(model.selectGurus(all,'BERKSHIRE HATHAWAY','popular').length,1);
 assert.equal(model.selectGurus(all,'no-such-manager','popular').length,0);
 assert.equal(model.selectGurus(all,'','size').length,71);
 assert.equal(all[0].slug,'berkshire-hathaway','sorting never mutates the source');
});

test('editorial popularity and actual reported size have distinct deterministic order',()=>{
 const data=[{...base,slug:'large',name:'Large',valueUsd:1e12},{...base,slug:'berkshire-hathaway',name:'Berkshire',valueUsd:100},{...base,slug:'bridgewater',name:'Bridgewater',valueUsd:50}];
 assert.deepEqual(Array.from(model.selectGurus(data,'','popular'),row=>row.slug),['berkshire-hathaway','bridgewater','large']);
 assert.deepEqual(Array.from(model.selectGurus(data,'','size'),row=>row.slug),['large','berkshire-hathaway','bridgewater']);
 assert.equal(new Set(model.FEATURED_GURUS).size,model.FEATURED_GURUS.length);
 assert.ok(model.FEATURED_GURUS.every(slug=>registry.some(guru=>guru.slug===slug)));
});

test('card summary preserves reported total and security count without sending full history',()=>{
 const filing=structuredClone(guruCatalog[0].archive.versions.at(-1));
 const summary=model.summarizeGuru(guruCatalog[0],filing);
 assert.equal(summary.valueUsd,filing.expectedValueUsd);
 assert.equal(summary.topHoldings.length,3);
 assert.equal(new Set(summary.topHoldings.map(row=>row.name)).size,3);
 assert.equal('archive' in summary,false,'full history does not go into client props');
 assert.equal(model.compactUsd(0),'$0');
 assert.equal(model.compactUsd(1e12),'$1조');
});

const holding=(cusip,issuer,shareClass,valueUsd,option=null,shareType='SH')=>({
 rowId:`${cusip}-${shareClass}-${option}`,cusip,issuer,shareClass,valueUsd,shares:10,shareType,option,mapping:null,
});
const summarizeRows=holdings=>model.summarizeGuru(guruCatalog[0],{
 ...guruCatalog[0].archive.versions.at(-1),holdings,expectedRows:holdings.length,
 expectedValueUsd:holdings.reduce((sum,row)=>sum+row.valueUsd,0),
});

test('ETF previews group split manager rows by security rather than collapsing one issuer',()=>{
 const rows=[
  holding('464287655','ISHARES TR','RUSSELL 2000 ETF',100),
  holding('464287655','ISHARES TR','RUSSELL 2000 ETF',90),
  holding('464287200','ISHARES TR','CORE S&P500 ETF',180),
  holding('464287465','ISHARES TR','MSCI EAFE ETF',160),
  holding('037833100','APPLE INC','COM',10),
 ];
 const summary=summarizeRows(rows);
 assert.equal(summary.valueUsd,540);assert.equal(summary.holdingsCount,4);
 assert.deepEqual(Array.from(summary.topHoldings,row=>[row.name,row.valueUsd]),[
  ['ISHARES TR · RUSSELL 2000 ETF',190],['ISHARES TR · CORE S&P500 ETF',180],['ISHARES TR · MSCI EAFE ETF',160],
 ]);
 assert.equal(rows[0].valueUsd,100,'summary aggregation never mutates holdings');
});

test('option direction and ordinary shares remain three separate top positions',()=>{
 const summary=summarizeRows([
  holding('78462F103','SPDR S&P 500 ETF TR','TR UNIT',100),
  holding('78462F103','SPDR S&P 500 ETF TR','TR UNIT',300,'PUT'),
  holding('78462F103','SPDR S&P 500 ETF TR','TR UNIT',10,'PUT'),
  holding('78462F103','SPDR S&P 500 ETF TR','TR UNIT',200,'CALL'),
 ]);
 assert.equal(summary.valueUsd,610);assert.equal(summary.holdingsCount,3);
 assert.deepEqual(Array.from(summary.topHoldings,row=>[row.name,row.valueUsd]),[
  ['SPDR S&P 500 ETF TR · TR UNIT · PUT',310],['SPDR S&P 500 ETF TR · TR UNIT · CALL',200],['SPDR S&P 500 ETF TR · TR UNIT',100],
 ]);
});

test('Alphabet A/C, different CUSIPs and principal amounts remain distinguishable',()=>{
 const alphabet=summarizeRows([
  holding('02079K305','ALPHABET INC','CAP STK CL A',200),
  holding('02079K107','ALPHABET INC','CAP STK CL C',190),
  holding('037833100','APPLE INC','COM',10),
 ]);
 assert.equal(alphabet.holdingsCount,3);assert.equal(alphabet.valueUsd,400);
 assert.deepEqual(Array.from(alphabet.topHoldings,row=>row.name),['ALPHABET INC · CL A','ALPHABET INC · CL C','APPLE INC']);
 const sameLabels=summarizeRows([
  holding('000000001','COMPANY','COM',100),holding('000000002','COMPANY','COM',90),
  holding('000000001','COMPANY','COM',80,null,'PRN'),
 ]);
 assert.equal(sameLabels.holdingsCount,3);assert.equal(sameLabels.valueUsd,270);
 assert.deepEqual(Array.from(sameLabels.topHoldings,row=>row.name),['COMPANY · COM · 000000001','COMPANY · COM · 000000002','COMPANY · 원금']);
});

test('directory renders one compact preview per manager with bounded initial DOM and honest criterion',()=>{
 const css={default:new Proxy({},{get:(_,key)=>String(key)})};
 const {GuruDirectory}=loadTypescript('src/features/gurus/GuruDirectory.tsx',{
  './Guru.module.css':css,
  'next/link':{default:({children,prefetch,...props})=>{void prefetch;return React.createElement('a',props,children);}},
 });
 const gurus=registry.map((row,index)=>({...base,...row,valueUsd:index+1}));
 const html=renderToStaticMarkup(React.createElement(GuruDirectory,{gurus}));
 assert.equal((html.match(/class="catalogItem"/g)||[]).length,24);
 for(const text of ['인기순','규모순','선정 기준','실제 조회·저장 수 순위는 아닙니다','더 보기','구루·운용사 검색'])assert.ok(html.includes(text),text);
 assert.ok(!html.includes('저장 0'));assert.ok(!html.includes('수익률'));
 const empty=renderToStaticMarkup(React.createElement(GuruDirectory,{gurus:[],pending:[{slug:'pending',name:'Pending',manager:'Name',reason:'공시 검증 중'}]}));
 assert.ok(empty.includes('확인된 구루 공시가 없습니다'));assert.ok(empty.includes('연결 확인 중인 운용사 1개'));assert.ok(!empty.includes('href="/gurus/pending"'));
});
