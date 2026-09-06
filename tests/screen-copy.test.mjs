import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTypescript} from './load-typescript.mjs';
const render=(component,props={})=>renderToStaticMarkup(createElement(component,props));
test('missing performance and failed performance remain distinct, with one visible error',()=>{
 let error=null; const overrides={'@/hooks/usePerformanceHistory':{usePerformanceHistory:()=>({points:[],loading:false,error,trackingStartedAt:null})},'@/hooks/usePortfolio':{useTransactions:()=>({transactions:[]}),usePreferences:()=>({displayCurrency:'KRW'}),usePortfolioMarket:()=>({summary:null,loading:false})},'@/features/market/use-stock-search':{useStockSearch:()=>({results:[],loading:false})},'@/features/performance/use-benchmark-series':{useBenchmarkSeries:()=>({benchmarkSeries:null,benchmarkLoading:false,benchmarkError:null})}};
 const {PerformanceAnalytics}=loadTypescript('src/components/PerformanceAnalytics.tsx',overrides);
 const {WealthChart}=loadTypescript('src/components/WealthChart.tsx',overrides);
 assert.match(render(PerformanceAnalytics),/성과 기록 없음/);assert.match(render(WealthChart),/자산 기록 없음/);
 error='격리된 조회 오류';for(const c of [PerformanceAnalytics,WealthChart]){const html=render(c);assert.equal(html.split(error).length-1,1);assert.match(html,/role="alert"/);assert.doesNotMatch(html,/기록 없음/)}
});
test('target not configured, missing quote, stale quote and currency mismatch never collapse into one label',()=>{
 const {WatchlistRow}=loadTypescript('src/features/watchlist/WatchlistRow.tsx',{'@/components/AssetAvatar':{AssetAvatar:()=>null}});
 const item={symbol:'AAPL',name:'Apple',targetPrice:90,targetCurrency:'USD'};
 const quote={symbol:'AAPL',name:'Apple',currency:'USD',price:100,change:1,changePercent:1};
 const base={item,loading:false,failed:false,onRemove:()=>null,onTarget:()=>null};
 assert.match(render(WatchlistRow,{...base,item:{...item,targetPrice:null}}),/미설정/);
 assert.match(render(WatchlistRow,base),/시세 확인 필요/);
 const stale=render(WatchlistRow,{...base,quote,failed:true});assert.match(stale,/시세 확인 필요/);assert.doesNotMatch(stale,/통화가 달라/);
 assert.match(render(WatchlistRow,{...base,quote:{...quote,currency:'KRW'}}),/통화가 달라 목표가 확인 필요/);
});
test('settings exposes the account and selected currency while retaining preference errors',()=>{
 let user=null; let preferenceError=null;
 const overrides={
  '@/components/TransactionBackupPanel':{TransactionBackupPanel:()=>null},
  '@/hooks/useAuth':{useAuth:()=>({user,loading:false,configured:true,signInWithGoogle:async()=>null,signOut:async()=>{}})},
  '@/hooks/usePortfolio':{usePreferences:()=>({displayCurrency:'USD',setDisplayCurrency:()=>{},preferenceError})},
 };
 const {default:Settings}=loadTypescript('src/app/settings/page.tsx',overrides);
 const signedOut=render(Settings);
 assert.match(signedOut,/로그인하지 않음/); assert.match(signedOut,/Google로 로그인/);
 assert.match(signedOut,/<option value="USD" selected="">달러 USD<\/option>/);
 assert.doesNotMatch(signedOut,/샘플 포트폴리오|현재 사용 환경|계정과 저장 공간|거래 저장|표시 통화 저장/);
 user={email:'settings-test@example.com',user_metadata:{full_name:'검증 사용자'},app_metadata:{providers:['google']},created_at:'2026-09-06T18:00:00Z'};
 preferenceError='표시 통화 서버 저장에 실패했습니다. 다시 선택해 주세요.';
 const signedIn=render(Settings);
 assert.match(signedIn,/settings-test@example.com/); assert.match(signedIn,/로그아웃/);
 assert.match(signedIn,/검증 사용자/); assert.match(signedIn,/2026년 9월 7일/); assert.match(signedIn,/Google/); assert.match(signedIn,/다시 저장/); assert.doesNotMatch(signedIn,/<details[^>]* open/); assert.match(signedIn,/role="alert"/); assert.ok(signedIn.includes(preferenceError));
});
test('settings shows currency failures once while keeping transaction failures visible',()=>{
 let pathname='/settings'; let error=null;
 const preferenceError='통화 저장 실패';
 const {StorageNotice}=loadTypescript('src/components/StorageNotice.tsx',{
  'next/navigation':{usePathname:()=>pathname},
  '@/hooks/usePortfolio':{
   useTransactions:()=>({error,status:'ready',writable:true}),
   useTransactionCommands:()=>({retryStorage:()=>{},reloadTransactions:()=>{}}),
   usePreferences:()=>({preferenceError}),
  },
 });
 assert.equal(render(StorageNotice),'');
 error='거래 저장 실패';assert.match(render(StorageNotice),/거래 저장 실패/);
 error=null;pathname='/portfolio';assert.match(render(StorageNotice),/통화 저장 실패/);
});

test('calculation disclosure is named, closed initially, and retains its full definition',()=>{
 const {CalculationHelp}=loadTypescript('src/components/CalculationHelp.tsx');
 const html=render(CalculationHelp,{label:'운용수익률',children:'입출금 영향을 제외한 성과'});
 assert.match(html,/<details/);assert.doesNotMatch(html,/<details[^>]* open/);assert.match(html,/aria-label="운용수익률 계산 기준"/);assert.match(html,/입출금 영향을 제외한 성과/);
});

test('empty portfolios do not substitute fictional holdings or performance',()=>{
 const {PortfolioMetrics}=loadTypescript('src/components/PortfolioMetrics.tsx',{'@/hooks/usePortfolio':{usePreferences:()=>({displayCurrency:'KRW'}),usePortfolioMarket:()=>({summary:null,loading:false})}});
 const html=render(PortfolioMetrics);assert.match(html,/보유종목 없음/);assert.doesNotMatch(html,/샘플|24,860,000/);
});
test('signed-out private routes show a login without a fictional portfolio preview',()=>{
 let pathname='/portfolio';
 const {AuthGate}=loadTypescript('src/components/AuthGate.tsx',{'next/navigation':{usePathname:()=>pathname},'@/hooks/useAuth':{useAuth:()=>({user:null,loading:false,configured:true,signInWithGoogle:async()=>null})},'@/app/auth.css':{}});
 const html=render(AuthGate,{children:'PRIVATE_RECORDS'});assert.match(html,/Google로 계속하기/);assert.doesNotMatch(html,/PRIVATE_RECORDS|샘플|24,860,000|cf-auth-preview/);
 pathname='/';assert.equal(render(AuthGate,{children:'PUBLIC_MARKET'}),'PUBLIC_MARKET');
});
