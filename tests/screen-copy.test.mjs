import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTypescript} from './load-typescript.mjs';
const render=(component,props={})=>renderToStaticMarkup(createElement(component,props));
test('missing performance and failed performance remain distinct, with one visible error',()=>{
 let error=null; const overrides={'@/hooks/usePerformanceHistory':{usePerformanceHistory:()=>({points:[],loading:false,error,trackingStartedAt:null})},'@/hooks/usePortfolio':{useTransactions:()=>({transactions:[]}),usePreferences:()=>({displayCurrency:'KRW'}),usePortfolioMarket:()=>({summary:null,loading:false})},'@/features/market/use-stock-search':{useStockSearch:()=>({results:[],loading:false})},'@/features/performance/use-benchmark-series':{useBenchmarkSeries:()=>({benchmarkSeries:null,benchmarkLoading:false,benchmarkError:null})}};
 const {PerformanceAnalytics}=loadTypescript('src/components/PerformanceAnalytics.tsx',overrides);
 assert.match(render(PerformanceAnalytics),/성과 기록 없음/);
 error='격리된 조회 오류';const html=render(PerformanceAnalytics);assert.equal(html.split(error).length-1,1);assert.match(html,/role="alert"/);assert.doesNotMatch(html,/기록 없음/);
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
 const {PortfolioMetrics}=loadTypescript('src/components/PortfolioMetrics.tsx',{'@/hooks/usePortfolio':{usePreferences:()=>({displayCurrency:'KRW'}),usePortfolioMarket:()=>({summary:null,loading:false}),usePortfolioDailyChange:()=>({available:false,bySymbol:{},reason:'보유종목 없음'})}});
 const html=render(PortfolioMetrics);assert.match(html,/보유종목 없음/);assert.doesNotMatch(html,/샘플|24,860,000/);
 assert.match(html,/href="#performance"/);assert.doesNotMatch(html,/href="\/insights"/);
});

test('holdings presents one allocation and one performance section after the editable positions',()=>{
 const holdings=[{symbol:'TEST',valuationAvailable:true,gainAvailable:true,displayMarketValue:140000,displayGainLoss:7000,displayGainLossPercent:5}];
 let allocationProps;
 const marker=(name)=>()=>createElement('div',null,name);
 const {default:PortfolioPage}=loadTypescript('src/app/portfolio/page.tsx',{
  '@/features/ads/PortfolioAd':{PortfolioAd:()=>null},
  '@/components/Header':{PageHeading:({children})=>createElement('header',null,children),AddTransactionLink:()=>null,CurrencySwitch:()=>null},
  '@/components/PortfolioMetrics':{PortfolioMetrics:marker('SUMMARY_ONCE')},
  '@/components/HoldingsTable':{HoldingsTable:marker('EDITABLE_HOLDINGS')},
  '@/components/AllocationChart':{AllocationChart:(props)=>{allocationProps=props;return createElement('div',null,'ALLOCATION_ONCE');}},
  '@/components/PerformanceAnalytics':{PerformanceAnalytics:marker('PERFORMANCE_ONCE')},
  '@/features/portfolio/ui/PortfolioHoldings.module.css':{default:{performance:'performance'}},
  '@/hooks/usePortfolio':{useTransactions:()=>({transactions:[]}),usePreferences:()=>({displayCurrency:'USD'}),usePortfolioMarket:()=>({summary:{holdings},loading:true,marketDataError:null}),usePortfolioDailyChange:()=>({available:false,reason:'자정 자료 미확인'})},
 });
 const html=render(PortfolioPage);
 for(const text of ['SUMMARY_ONCE','ALLOCATION_ONCE','PERFORMANCE_ONCE'])assert.equal(html.split(text).length-1,1);
 assert.ok(html.indexOf('EDITABLE_HOLDINGS')<html.indexOf('PERFORMANCE_ONCE'));
 assert.match(html,/<section id="performance"[^>]*aria-label="기간 성과"/);
 assert.equal(allocationProps.holdings,holdings);assert.equal(allocationProps.displayCurrency,'USD');assert.equal(allocationProps.loading,true);
});

test('integrated asset history retains net contributions and explicit USD conversion without inventing missing FX',()=>{
 let currency='USD';
 let chartProps;
 let summary={holdings:[{currency:'KRW',valuationAvailable:true,gainAvailable:true,currentFxRateToKRW:1,marketValueKRW:280000,marketValueUSD:200}],stockPriceImpactKRW:10000,fxImpactKRW:-2000};
 const points=[
  {date:'2026-09-17',cutoffAt:'2026-09-17T14:59:59Z',assetValueKRW:140000,twrIndex:100,netFlowKRW:70000,cumulativeNetFlowKRW:70000,cumulativeProfitKRW:70000,active:true,final:true},
  {date:'2026-09-18',cutoffAt:'2026-09-18T14:59:59Z',assetValueKRW:280000,twrIndex:105,netFlowKRW:70000,cumulativeNetFlowKRW:140000,cumulativeProfitKRW:140000,active:true,final:true},
 ];
 const {PerformanceAnalytics}=loadTypescript('src/components/PerformanceAnalytics.tsx',{
  '@/hooks/usePerformanceHistory':{usePerformanceHistory:()=>({points,loading:false,error:null,trackingStartedAt:'2026-09-17T00:00:00Z'})},
  '@/hooks/usePortfolio':{useTransactions:()=>({transactions:[]}),usePreferences:()=>({displayCurrency:currency}),usePortfolioMarket:()=>({summary})},
  '@/features/market/use-stock-search':{useStockSearch:()=>({results:[],loading:false})},
  '@/features/performance/use-benchmark-series':{useBenchmarkSeries:()=>({benchmarkSeries:null,benchmarkLoading:false,benchmarkError:null})},
  '@/features/performance/Charts':{AssetChart:(props)=>{chartProps=props;return null;},ReturnChart:()=>null},
 });
 const dollars=render(PerformanceAnalytics);
 assert.equal(chartProps.currency,'USD');
 assert.deepEqual(Array.from(chartProps.data,p=>p.assetValue),[100,200]);
 assert.deepEqual(Array.from(chartProps.data,p=>p.cumulativeNetFlow),[50,100]);
 assert.match(dollars,/USD · 현재 환율 환산/);assert.match(dollars,/보유분 평가손익 · KRW/);
 assert.match(dollars,/text-cf-market-up/);assert.match(dollars,/text-cf-market-down/);
 summary={holdings:[{currency:'USD',valuationAvailable:true,gainAvailable:false,currentFxRateToKRW:0,marketValueKRW:0,marketValueUSD:200}],stockPriceImpactKRW:999999,fxImpactKRW:999999};
 const missingFx=render(PerformanceAnalytics);
 assert.equal(chartProps.currency,'KRW');assert.equal(chartProps.data[1].assetValue,280000);
 assert.match(missingFx,/달러 환율 확인 필요/);assert.doesNotMatch(missingFx,/보유분 평가손익 · KRW|999,999/);
 currency='KRW';
 assert.doesNotMatch(render(PerformanceAnalytics),/달러 환율 확인 필요|현재 환율 환산/);
});

test('integrated asset chart distinguishes asset values and cumulative contributions in the tooltip',()=>{
 const lines=[];const areas=[];let tooltip;
 const wrap=({children})=>createElement('div',null,children);
 const {AssetChart}=loadTypescript('src/features/performance/Charts.tsx',{
  recharts:{ResponsiveContainer:wrap,ComposedChart:wrap,LineChart:wrap,CartesianGrid:()=>null,XAxis:()=>null,YAxis:()=>null,ReferenceArea:()=>null,Area:(props)=>{areas.push(props);return null;},Line:(props)=>{lines.push(props);return null;},Tooltip:(props)=>{tooltip=props;return null;}},
 });
 render(AssetChart,{data:[{date:'2026-09-18',assetValue:200,cumulativeNetFlow:100}],inactivePeriods:[],currency:'USD'});
 assert.equal(areas[0].dataKey,'assetValue');assert.equal(areas[0].dot.r,4);assert.equal(lines[0].dataKey,'cumulativeNetFlow');
 assert.equal(tooltip.formatter(100,'cumulativeNetFlow')[1],'누적 순투입금');
 assert.equal(tooltip.formatter(200,'assetValue')[1],'평가액');
 assert.match(tooltip.formatter(200,'assetValue')[0],/\$200/);
});
test('signed-out private routes show a login without a fictional portfolio preview',()=>{
 let pathname='/portfolio';
 const {AuthGate}=loadTypescript('src/components/AuthGate.tsx',{'next/navigation':{usePathname:()=>pathname},'@/hooks/useAuth':{useAuth:()=>({user:null,loading:false,configured:true,signInWithGoogle:async()=>null})},'@/app/auth.css':{}});
 const html=render(AuthGate,{children:'PRIVATE_RECORDS'});assert.match(html,/Google로 계속하기/);assert.doesNotMatch(html,/PRIVATE_RECORDS|샘플|24,860,000|cf-auth-preview/);
 pathname='/';assert.equal(render(AuthGate,{children:'PUBLIC_MARKET'}),'PUBLIC_MARKET');
});
