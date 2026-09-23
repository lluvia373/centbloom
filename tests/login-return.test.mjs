import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadTypescript } from './load-typescript.mjs';
const model=loadTypescript('src/features/auth/login-return.ts');
const storage=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
test('login return accepts only internal known actions and strips unrelated query/hash data',()=>{
 for(const path of ['//evil.test','/\\evil.test','https://evil.test','/search/other','/save-interest/%2F..','/save-interest/%0A','/unknown','/search\n'])assert.equal(model.safeReturnPath(path),null,path);
 assert.equal(model.safeReturnPath('/search?symbol=0700.HK&price=100#token'),'/search?symbol=0700.HK');
 assert.equal(model.safeReturnPath('/save-interest/AAPL'),'/save-interest/AAPL');
 assert.equal(model.safeReturnPath('/portfolio?secret=none'),'/portfolio');
 assert.equal(model.safeReturnPath('/transactions'),'/transactions');
 assert.equal(model.failedReturnPath('/search?symbol=AAPL'),'/search?symbol=AAPL&auth_result=failed');
 assert.equal(model.failedReturnPath('//evil.test'),'/?auth_result=failed');
});
test('login return survives refresh, is claimed once, and expires or cancels without replay',()=>{
 const s=storage();model.startLoginReturn(s,'/search?symbol=AAPL',1000);
 assert.equal(model.takeLoginReturn(s,2000),'/search?symbol=AAPL');assert.equal(model.takeLoginReturn(s,2000),null);
 model.startLoginReturn(s,'/watchlist',1000);model.cancelLoginReturn(s);assert.equal(model.takeLoginReturn(s,2000),null);
 model.startLoginReturn(s,'/watchlist',1000);assert.equal(model.takeLoginReturn(s,1000+31*60000),null);
 model.startLoginReturn(s,'/watchlist',1000);assert.equal(model.takeLoginReturn(s,999),null);
 assert.throws(()=>model.startLoginReturn({setItem(){throw Error('blocked')}},'/watchlist'));
});
test('guest watch action retains the selected symbol without any write, after login save remains explicit',()=>{
 let user=null,writes=0;const auth={useAuth:()=>({user,configured:true,loading:false})};
 const overrides={'@/hooks/useAuth':auth,'@/hooks/useWatchlist':{useWatchlist:()=>({items:[],ready:true,pending:false,addItem:()=>{writes++;return null;},refresh(){}})},'next/link':{default:({children,...props})=>React.createElement('a',props,children)}};
 const {WatchStockButton}=loadTypescript('src/features/watchlist/WatchStockButton.tsx',overrides);
 for(const compact of [false,true]) assert.match(renderToStaticMarkup(React.createElement(WatchStockButton,{symbol:'0700.HK',name:'Tencent',compact})),/href="\/save-interest\/0700.HK"/);
 user={id:'account-a',email:'account-a@example.test'};
 const {SaveInterest}=loadTypescript('src/features/watchlist/SaveInterest.tsx',overrides);
 const html=renderToStaticMarkup(React.createElement(SaveInterest,{symbol:'0700.HK'}));
 assert.match(html,/account-a@example.test/);assert.match(html,/관심종목에 담기/);assert.match(html,/종목으로 돌아가기/);assert.equal(writes,0);
});
