import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTypescript} from './load-typescript.mjs';
const render=(component,props={})=>renderToStaticMarkup(createElement(component,props));
test('missing performance and failed performance remain distinct, with one visible error',()=>{
 let error=null; const overrides={'@/hooks/usePerformanceHistory':{usePerformanceHistory:()=>({points:[],loading:false,error,trackingStartedAt:null})},'@/hooks/usePortfolio':{useTransactions:()=>({transactions:[]}),usePreferences:()=>({displayCurrency:'KRW'})},'@/hooks/useWorkspace':{useWorkspace:()=>({isDemo:false}),useWorkspaceSummary:()=>({summary:null})},'@/features/market/use-stock-search':{useStockSearch:()=>({results:[],loading:false})},'@/features/performance/use-benchmark-series':{useBenchmarkSeries:()=>({benchmarkSeries:null,benchmarkLoading:false,benchmarkError:null})}};
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
test('sample switch keeps a valid description pointing to separation from actual trades',()=>{
 const {default:Settings}=loadTypescript('src/app/settings/page.tsx',{'@/components/TransactionBackupPanel':{TransactionBackupPanel:()=>null},'@/hooks/useAuth':{useAuth:()=>({user:null})},'@/hooks/useWorkspace':{useWorkspace:()=>({isDemo:true,setDemo:()=>{}})},'@/hooks/usePortfolio':{useTransactions:()=>({transactions:[]}),usePreferences:()=>({displayCurrency:'KRW',setDisplayCurrency:()=>{}})}});
 const html=render(Settings);assert.match(html,/aria-describedby="sample-view-description"/);assert.match(html,/id="sample-view-description"[^>]*>[^<]*내 거래 기록에 추가되지 않음/);assert.doesNotMatch(html,/<aside/);
});
test('calculation disclosure is named, closed initially, and retains its full definition',()=>{
 const {CalculationHelp}=loadTypescript('src/components/CalculationHelp.tsx');
 const html=render(CalculationHelp,{label:'운용수익률',children:'입출금 영향을 제외한 성과'});
 assert.match(html,/<details/);assert.doesNotMatch(html,/<details[^>]* open/);assert.match(html,/aria-label="운용수익률 계산 기준"/);assert.match(html,/입출금 영향을 제외한 성과/);
});
