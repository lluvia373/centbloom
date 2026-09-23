import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTypescript} from './load-typescript.mjs';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {resolveTitle} from 'next/dist/lib/metadata/resolvers/resolve-title.js';

test('browser tab title identifies local development and preserves production branding',()=>{
 const source=readFileSync('src/app/layout.tsx','utf8');
 const ast=ts.createSourceFile('layout.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const declaration=ast.statements.filter(ts.isVariableStatement)
  .flatMap(statement=>Array.from(statement.declarationList.declarations))
  .find(node=>node.name.getText(ast)==='metadata');
 assert.ok(declaration?.initializer);
 for(const environment of ['development','production']){
  const metadata=runInNewContext(`(${declaration.initializer.getText(ast)})`,{process:{env:{NODE_ENV:environment}},URL});
  const root=resolveTitle(metadata.title,null);
  assert.equal(root.absolute,environment==='development'?'localhost:3000':'센트블룸 | Centbloom');
  const child=resolveTitle('증시 캘린더 | Centbloom',root.template);
  assert.equal(child.absolute,environment==='development'?'localhost:3000':'증시 캘린더 | Centbloom');
  assert.equal(metadata.applicationName,'Centbloom');
 }
});

const render=(component,props={})=>renderToStaticMarkup(createElement(component,props));
test('daily summary: total leads a subordinate breakdown without equation or timezone clutter', () => {
 const daily = { available: true, estimated: true, change: 100, priceImpact: 60, fxImpact: 40, bySymbol: {},
  referenceDates: ['2026-09-18'], fxNotes: ['CNY/KRW 자정 기준: 2026-09-18 ECB 일별 참고 환율 적용'] };
 const {PortfolioMetrics}=loadTypescript('src/components/PortfolioMetrics.tsx',{'@/hooks/usePortfolio':{
  usePreferences:()=>({displayCurrency:'KRW'}),usePortfolioMarket:()=>({summary:null,loading:false}),usePortfolioDailyChange:()=>daily,
 }});
 const html=render(PortfolioMetrics);
 assert.match(html,/<dt>오늘 손익<\/dt><dd class="portfolio-summary-result positive">\+₩100<\/dd>/);
 assert.match(html,/오늘 손익 구성/);
 assert.match(html,/오늘 손익<\/dt>.*\+₩100.*portfolio-summary-factors.*종목 손익<\/span><strong[^>]*>\+₩60<\/strong>.*환율 손익<\/span><strong[^>]*>\+₩40<\/strong>/s);
 assert.doesNotMatch(html,/portfolio-summary-equation|portfolio-summary-operator|>[+=]<|합한 금액/);
 assert.doesNotMatch(html,/오늘 변동|오늘 기여/);
 assert.doesNotMatch(html,/00:00|KST|주가·매매/);
 assert.doesNotMatch(html,/한국시간/);
 assert.doesNotMatch(html,/<details\b|<summary\b|오늘 손익의 환율 기준|추정/);
 assert.doesNotMatch(html,/CNY\/KRW|2026-09-18 ECB|일별 환율 적용|최종 수신 환율 적용/);
});

test('daily summary: unrepresentable components retain the total without fabricated detail', () => {
 const daily={available:true,change:100,priceImpact:Infinity,fxImpact:0,bySymbol:{}};
 const {PortfolioMetrics}=loadTypescript('src/components/PortfolioMetrics.tsx',{'@/hooks/usePortfolio':{
  usePreferences:()=>({displayCurrency:'KRW'}),usePortfolioMarket:()=>({summary:null,loading:false}),usePortfolioDailyChange:()=>daily,
 }});
 const invalid=render(PortfolioMetrics);
 assert.match(invalid,/\+₩100/);assert.match(invalid,/세부 손익 표시 불가/);
 assert.doesNotMatch(invalid,/portfolio-summary-factors|Infinity|∞/);
 Object.assign(daily,{change:1e20,priceImpact:1e20,fxImpact:0});
 const large=render(PortfolioMetrics);
 assert.match(large,/세부 손익 표시 불가/);assert.doesNotMatch(large,/portfolio-summary-factors/);
});

test('daily summary: normal weekend rates do not add detailed timestamps', () => {
 const daily = { available: true, estimated: false, change: 0, priceImpact: 0, fxImpact: 0, bySymbol: {},
  referenceDates: [], fxNotes: ['HKD', 'CNY', 'JPY', 'USD'].flatMap(currency => [
   `${currency}/KRW 자정 기준: 9/19 06:00 KST · 주말 마감 무렵`,
   `${currency}/KRW 현재: 9/21 14:24 KST`,
  ]) };
 const {PortfolioMetrics}=loadTypescript('src/components/PortfolioMetrics.tsx',{'@/hooks/usePortfolio':{
  usePreferences:()=>({displayCurrency:'KRW'}),usePortfolioMarket:()=>({summary:null,loading:false}),usePortfolioDailyChange:()=>daily,
 }});
 const html=render(PortfolioMetrics);
 assert.match(html,/₩0/); assert.doesNotMatch(html,/한국시간|00:00/);
 assert.doesNotMatch(html,/추정|일별 환율 적용|<details\b|<summary\b|오늘 손익의 환율 기준|주말 마감 무렵/);
 for (const note of daily.fxNotes) assert.ok(!html.includes(note), 'currency timestamps must stay out of the summary');
});

test('daily summary: mixed FX dates stay out of the caption and a calculation failure remains visible', () => {
 const daily = { available: true, estimated: true, change: 0, priceImpact: 0, fxImpact: 0, bySymbol: {},
  referenceDates: ['2026-09-18'], carriedDates: ['2026-09-17'], fxNotes: [] };
 const {PortfolioMetrics}=loadTypescript('src/components/PortfolioMetrics.tsx',{'@/hooks/usePortfolio':{
  usePreferences:()=>({displayCurrency:'KRW'}),usePortfolioMarket:()=>({summary:null,loading:false}),usePortfolioDailyChange:()=>daily,
 }});
 const html=render(PortfolioMetrics);
 assert.doesNotMatch(html,/한국시간/);
 assert.doesNotMatch(html,/일별 환율 적용|최종 수신 환율 적용|추정/);
 daily.available=false; daily.reason='현재 환율 미확인';
 const missing=render(PortfolioMetrics);
 assert.match(missing,/현재 환율 미확인/); assert.doesNotMatch(missing,/오늘 00:00 기준|일별 환율 적용|최종 수신 환율 적용|<details\b|<summary\b/);
});
test('missing performance and failed performance remain distinct, with one visible error',()=>{
 let error=null; const overrides={'@/hooks/usePerformanceHistory':{usePerformanceHistory:()=>({points:[],loading:false,error,refreshError:error,scopeKey:'copy-test',trackingStartedAt:null})},'@/hooks/usePortfolio':{useTransactions:()=>({transactions:[]}),usePreferences:()=>({displayCurrency:'KRW'}),usePortfolioMarket:()=>({summary:null,currentUsdKrwRate:null,loading:false})},'@/features/market/use-stock-search':{useStockSearch:()=>({results:[],loading:false})},'@/features/performance/use-benchmark-series':{useBenchmarkSeries:()=>({benchmarks:[],retry:()=>{}})}};
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

test('portfolio summary: empty portfolios do not substitute fictional holdings or performance',()=>{
 const {PortfolioMetrics}=loadTypescript('src/components/PortfolioMetrics.tsx',{'@/hooks/usePortfolio':{usePreferences:()=>({displayCurrency:'KRW'}),usePortfolioMarket:()=>({summary:{holdings:[],totalValue:0,totalGainLoss:0,totalCost:0},loading:false}),usePortfolioDailyChange:()=>({available:false,bySymbol:{},reason:'보유종목 없음'})}});
 const html=render(PortfolioMetrics);assert.match(html,/보유종목 없음/);assert.doesNotMatch(html,/샘플|24,860,000/);
 assert.doesNotMatch(html,/href="#performance"|href="\/insights"|portfolio-summary-count|portfolio-summary-factors/);
});

test('portfolio summary: gain, cost and daily factors stay in their own metric groups',()=>{
 let displayCurrency='KRW';
 const summary={holdings:[{symbol:'TEST',valuationAvailable:true,gainAvailable:true}],totalValue:30663766,totalGainLoss:2568895,totalGainLossPercent:9.14,totalCost:28094871};
 const daily={available:true,change:258040,priceImpact:348524,fxImpact:-90484,bySymbol:{TEST:258040}};
 const {PortfolioMetrics}=loadTypescript('src/components/PortfolioMetrics.tsx',{'@/hooks/usePortfolio':{
  usePreferences:()=>({displayCurrency}),usePortfolioMarket:()=>({summary,loading:false}),usePortfolioDailyChange:()=>daily,
 }});
 const html=render(PortfolioMetrics);
 assert.match(html,/<dt>총 보유자산<\/dt>/);
 assert.doesNotMatch(html,/portfolio-summary-count|1종목/);
 assert.match(html,/<dd class="portfolio-summary-result portfolio-summary-gain positive"><span>\+₩2,568,895<\/span><span class="portfolio-summary-percent">\+9.14%<\/span><\/dd>/);
 assert.match(html,/<dd class="portfolio-summary-context portfolio-summary-cost">매입원가 ₩28,094,871<\/dd>/);
 const totalGroup=html.match(/<div class="portfolio-summary-total">(.*?)<\/div>/s)?.[1];
 assert.match(totalGroup,/총 보유자산.*₩30,663,766/s);
 assert.doesNotMatch(totalGroup,/매입원가/);
 const valuationGroup=html.match(/<div class="portfolio-summary-valuation">(.*?)<\/div>/s)?.[1];
 assert.match(valuationGroup,/평가손익.*\+₩2,568,895.*\+9.14%.*portfolio-summary-cost.*매입원가 ₩28,094,871/s);
 assert.equal(html.split('매입원가').length-1,1);
 const dailyGroup=html.match(/<div class="portfolio-summary-daily">(.*?)<\/div>/s)?.[1];
 assert.ok(dailyGroup); assert.match(dailyGroup,/오늘 손익.*\+₩258,040.*종목 손익.*\+₩348,524.*환율 손익.*-₩90,484/s);
 assert.ok(html.indexOf('portfolio-summary-total') < html.indexOf('portfolio-summary-valuation'));
 assert.ok(html.indexOf('portfolio-summary-valuation') < html.indexOf('portfolio-summary-daily'));
 assert.match(dailyGroup, /^<dt>오늘 손익<\/dt><dd class="portfolio-summary-result positive">/);
 assert.doesNotMatch(dailyGroup,/한국시간|00:00|KST|매입원가|주가·매매/);
 assert.doesNotMatch(html,/portfolio-summary-footnote|<details\b|<summary\b| title=/);
 displayCurrency='USD';
 const dollars=render(PortfolioMetrics);
 assert.match(dollars,/US\$2,568,895.00/); assert.doesNotMatch(dollars,/₩/);
});

test('portfolio summary: partial data, zero and fully sold positions retain independent states',()=>{
 const holding={symbol:'TEST',valuationAvailable:false,gainAvailable:false};
 let summary={holdings:[holding],totalValue:100,totalGainLoss:0,totalGainLossPercent:0,totalCost:100};
 let loading=true;
 const daily={available:true,change:0,priceImpact:0,fxImpact:0,bySymbol:{}};
 const {PortfolioMetrics}=loadTypescript('src/components/PortfolioMetrics.tsx',{'@/hooks/usePortfolio':{
  usePreferences:()=>({displayCurrency:'KRW'}),usePortfolioMarket:()=>({summary,loading}),usePortfolioDailyChange:()=>daily,
 }});
 assert.match(render(PortfolioMetrics),/시세 확인 중/);
 loading=false; assert.match(render(PortfolioMetrics),/일부 시세 확인 필요/);
 holding.valuationAvailable=true; assert.match(render(PortfolioMetrics),/매입 정보 확인 필요/);
 holding.gainAvailable=true;
 const zero=render(PortfolioMetrics);
 assert.match(zero,/portfolio-summary-percent">\+0.00%/); assert.doesNotMatch(zero,/class="[^"]*(positive|negative)/);
 summary={...summary,holdings:[]}; Object.assign(daily,{change:500,priceImpact:600,fxImpact:-100,bySymbol:{SOLD:500}});
 const sold=render(PortfolioMetrics);
 assert.match(sold,/보유종목 없음/); assert.match(sold,/전량 매도 1종목 \+₩500 포함/);
 assert.match(sold,/portfolio-summary-factors/);
 daily.available=false; daily.reason='현재 환율 미확인';
 const failed=render(PortfolioMetrics);
 assert.match(failed,/현재 환율 미확인/); assert.doesNotMatch(failed,/portfolio-summary-factors|전량 매도|오늘 00:00/);
});

test('portfolio overview: summary and one focusable graph precede integrated holdings and investment history',()=>{
 const holdings=[{symbol:'TEST',valuationAvailable:true,gainAvailable:true,displayMarketValue:140000,displayGainLoss:7000,displayGainLossPercent:5}];
 const transactions=[{id:'trade-test',symbol:'TEST',type:'buy',quantity:1}];
 let marketState={summary:{holdings},loading:true,marketDataError:null};
 let holdingsProps; let headingProps; let detailsProps;
 const referenceDatesBySymbol = { TEST: ['2026-09-18'] };
 const carriedDatesBySymbol = { TEST: ['2026-09-17'] };
 const dailyChange={available:false,reason:'자정 자료 미확인',referenceDatesBySymbol,carriedDatesBySymbol,bySymbol:{TEST:7000}};
 const marker=(name)=>function Marker(){return createElement('div',null,name);};
 const {default:PortfolioPage}=loadTypescript('src/app/portfolio/page.tsx',{
  '@/features/ads/PortfolioAd':{PortfolioAd:()=>null},
  '@/components/Header':{PageHeading:(props)=>{headingProps=props;return createElement('header',null,props.titleAction,props.children);},AddTransactionLink:marker('ADD_TRANSACTION'),CurrencySwitch:marker('CURRENCY_SWITCH')},
  '@/components/PortfolioMetrics':{PortfolioMetrics:marker('SUMMARY_ONCE')},
  '@/components/HoldingsTable':{HoldingsTable:(props)=>{holdingsProps=props;return createElement('div',null,'EDITABLE_HOLDINGS');}},
  '@/components/PerformanceAnalytics':{PerformanceAnalytics:marker('PERFORMANCE_ONCE')},
  '@/features/performance/InvestmentHistory':{InvestmentHistory:marker('HISTORY_ONCE')},
  '@/features/portfolio/ui/PortfolioDetails':{PortfolioDetails:(props)=>{
   detailsProps=props;return createElement('section',{'data-view':'portfolio-details'},props.holdings,props.history);
  }},
  '@/features/portfolio/ui/PortfolioHoldings.module.css':{default:{performance:'performance'}},
  '@/hooks/usePortfolio':{useTransactions:()=>({transactions}),usePreferences:()=>({displayCurrency:'USD'}),usePortfolioMarket:()=>marketState,usePortfolioDailyChange:()=>dailyChange},
 });
 const html=render(PortfolioPage);
 assert.equal(headingProps.title,'보유자산');assert.equal(headingProps.titleAction,undefined);
 assert.match(html,/<header><div>CURRENCY_SWITCH<\/div><div>ADD_TRANSACTION<\/div><\/header>/);
 assert.doesNotMatch(html,/aria-controls="performance"|href="#performance"|<button[^>]*>기간 성과<\/button>/);
 for(const text of ['SUMMARY_ONCE','PERFORMANCE_ONCE','EDITABLE_HOLDINGS','HISTORY_ONCE'])assert.equal(html.split(text).length-1,1);
 assert.equal(html.split('class="portfolio-overview"').length-1,1);
 assert.match(html,/<div class="portfolio-overview"><div>SUMMARY_ONCE<\/div><section\b[^>]*><div>PERFORMANCE_ONCE<\/div><\/section><\/div><section data-view="portfolio-details"><div>EDITABLE_HOLDINGS<\/div><div>HISTORY_ONCE<\/div><\/section>/);
 assert.deepEqual(Object.keys(detailsProps).sort(),['history','holdings']);
 assert.doesNotMatch(readFileSync(new URL('../src/app/portfolio/page.tsx',import.meta.url),'utf8'),/AllocationChart/);
 assert.equal('holdingCount' in detailsProps,false);
 assert.equal(html.split('id="performance"').length-1,1);
 assert.match(html,/<section id="performance"[^>]*aria-label="기간 성과"/);
 assert.match(html,/<section id="performance" tabindex="-1"/);
 assert.equal(holdingsProps.embedded,true);assert.equal(holdingsProps.showAllocation,true);
 assert.equal(holdingsProps.holdings,holdings);assert.equal(holdingsProps.transactions,transactions);
 assert.equal(holdingsProps.displayCurrency,'USD');assert.equal(holdingsProps.loading,true);assert.equal(holdingsProps.editable,true);
 assert.equal(holdingsProps.referenceDatesBySymbol,referenceDatesBySymbol);
 assert.equal(holdingsProps.carriedDatesBySymbol,carriedDatesBySymbol);
 assert.equal(holdingsProps.dailyChangeReason,dailyChange.reason);
 assert.equal(holdingsProps.dailyChanges,undefined);
 assert.match(renderToStaticMarkup(holdingsProps.toolbarAction),/보유 자산 CSV/);
 dailyChange.available=true;render(PortfolioPage);
 assert.equal(holdingsProps.dailyChanges,dailyChange.bySymbol);
 for(const loading of [true,false]){
  marketState={summary:null,loading,marketDataError:null};
  const unknown=render(PortfolioPage);
  assert.doesNotMatch(unknown,/EDITABLE_HOLDINGS|보유 자산 CSV/,'unread or failed ledger is not an empty portfolio');
  assert.match(unknown,/SUMMARY_ONCE/);assert.match(unknown,/PERFORMANCE_ONCE/);
  assert.match(unknown,/HISTORY_ONCE/);assert.equal('holdingCount' in detailsProps,false);
  assert.match(unknown,loading ? /role="status">보유종목 확인 중/ : /role="alert">보유종목을 확인하지 못했습니다\./);
 }
 marketState={summary:{holdings:[]},loading:false,marketDataError:null};
 const empty=render(PortfolioPage);
 assert.match(empty,/EDITABLE_HOLDINGS/,'confirmed zero holdings keeps the normal empty-state UI');
 assert.equal(holdingsProps.holdings.length,0);assert.equal(holdingsProps.toolbarAction,undefined);
 assert.equal('holdingCount' in detailsProps,false);assert.equal(holdingsProps.showAllocation,true);
 assert.match(empty,/HISTORY_ONCE/,'closed holdings retain the separate monthly and yearly history');
 assert.match(empty,/PERFORMANCE_ONCE/,'closed holdings do not hide past performance');
});

test('portfolio overview: the embedded graph keeps period controls and loading states without a second heading',()=>{
 const {PORTFOLIO_LINE}=loadTypescript('src/features/performance/Charts.tsx');
 const points=[
  {date:'2026-09-17',cutoffAt:'2026-09-17T14:59:59Z',assetValueKRW:140000,twrIndex:100,netFlowKRW:0,cumulativeNetFlowKRW:70000,cumulativeProfitKRW:70000,active:true,final:true},
  {date:'2026-09-18',cutoffAt:'2026-09-18T14:59:59Z',assetValueKRW:147000,twrIndex:105,netFlowKRW:0,cumulativeNetFlowKRW:70000,cumulativeProfitKRW:77000,active:true,final:true},
 ];
 let history={points,loading:false,error:null,refreshError:null,scopeKey:'layout-test'};
 const {PerformanceAnalytics}=loadTypescript('src/components/PerformanceAnalytics.tsx',{
  '@/hooks/usePerformanceHistory':{usePerformanceHistory:()=>history},
  '@/hooks/usePortfolio':{useTransactions:()=>({transactions:[]}),usePreferences:()=>({displayCurrency:'KRW'}),usePortfolioMarket:()=>({summary:null,currentUsdKrwRate:null})},
  '@/features/market/use-stock-search':{useStockSearch:()=>({results:[],loading:false})},
  '@/features/performance/use-benchmark-series':{useBenchmarkSeries:()=>({benchmarks:[],retry:()=>{}})},
  '@/features/performance/Charts':{PORTFOLIO_LINE,AssetChart:()=>createElement('div',null,'ASSET_GRAPH_ONCE'),ReturnChart:()=>createElement('div',null,'RETURN_GRAPH')},
 });
 const checkFrame=(html)=>{
  assert.equal(html.split('class="performance-panel"').length-1,1);
  assert.doesNotMatch(html,/<h2\b|performance-heading|<details\b/);
 };
 const ready=render(PerformanceAnalytics);checkFrame(ready);
 assert.equal(ready.split('ASSET_GRAPH_ONCE').length-1,1);assert.doesNotMatch(ready,/RETURN_GRAPH/);
 assert.match(ready,/role="group" aria-label="조회 기간"/);assert.match(ready,/role="group" aria-label="조회 날짜"/);
 for(const label of ['1일','5일','1개월','3개월','올해','1년','전체'])assert.ok(ready.includes(`>${label}</button>`));
 assert.doesNotMatch(ready,/>1주<\/button>/);
 for(const label of ['시작일','종료일']){
  const inputId=ready.match(new RegExp(`<label for="([^"]+)"[^>]*>${label}</label>`))?.[1];
  assert.ok(inputId);assert.ok(ready.includes(`<input id="${inputId}"`));
 }
 assert.match(ready,/기간 손익/);assert.match(ready,/원화 기준/);
 assert.match(ready,/role="group" aria-label="차트 종류"/);assert.match(ready,/보유자산 추이/);assert.match(ready,/수익률 비교/);
 assert.match(ready,/role="region" aria-label="보유자산 추이 그래프"/);
 assert.doesNotMatch(ready,/performance-history|performance-line-key|<h3>투자 성과/);
 assert.equal(ready.split('aria-label="차트 종류"').length-1,1);
 assert.ok(ready.indexOf('aria-label="차트 종류"')<ready.indexOf('class="performance-toolbar"'));
 history={...history,points:[],loading:true};
 const loading=render(PerformanceAnalytics);checkFrame(loading);
 assert.match(loading,/aria-busy="true"/);assert.match(loading,/성과 불러오는 중/);assert.doesNotMatch(loading,/ASSET_GRAPH_ONCE|기간 손익/);
 history={...history,loading:false};
 const empty=render(PerformanceAnalytics);checkFrame(empty);
 assert.match(empty,/성과 기록 없음/);assert.doesNotMatch(empty,/ASSET_GRAPH_ONCE|성과 조회 실패/);
 history={...history,error:'LAYOUT_DATA_ERROR',refreshError:'LAYOUT_DATA_ERROR'};
 const failed=render(PerformanceAnalytics);checkFrame(failed);
 assert.match(failed,/성과 조회 실패/);assert.match(failed,/role="alert"/);assert.equal(failed.split('LAYOUT_DATA_ERROR').length-1,1);assert.doesNotMatch(failed,/ASSET_GRAPH_ONCE|성과 기록 없음/);
});

test('portfolio summary: shared heading keeps the title action separate from primary controls',()=>{
 const {PageHeading}=loadTypescript('src/components/Header.tsx',{
  '@/features/navigation':{primaryNavigation:[],navigationArea:()=>null},
  '@/features/market/MarketHeader.module.css':{default:{}},
  '@/components/BrandMark':{BrandMark:()=>null},
  '@/features/market/MarketTicker':{MarketTicker:()=>null},
  '@/features/home/StockDiscovery':{StockDiscovery:()=>null},
  '@/hooks/useAuth':{}, '@/hooks/usePortfolio':{},
 });
 const titleAction=createElement('a',{href:'#performance'},'기간 성과');
 const html=render(PageHeading,{title:'보유자산',titleAction,children:createElement('button',null,'거래 기록하기')});
 assert.match(html,/<div class="page-heading-title"><h1>보유자산<\/h1><a href="#performance">기간 성과<\/a><\/div>/);
 assert.match(html,/<div class="page-heading-actions"><button>거래 기록하기<\/button><\/div>/);
 const plain=render(PageHeading,{title:'관심종목'});
 assert.doesNotMatch(plain,/<a\b|page-heading-actions/); assert.match(plain,/<h1>관심종목<\/h1>/);
});

test('integrated asset history preserves flow records but only displays holdings and explicit USD conversion',()=>{
 const {PORTFOLIO_LINE}=loadTypescript('src/features/performance/Charts.tsx');
 let currency='USD';
 let currentUsdKrwRate=1400;
 let chartProps;
 let summary={holdings:[{currency:'KRW',valuationAvailable:true,gainAvailable:true,currentFxRateToKRW:1,marketValueKRW:280000,marketValueUSD:200}],stockPriceImpactKRW:10000,fxImpactKRW:-2000};
 const points=[
  {date:'2026-09-17',cutoffAt:'2026-09-17T14:59:59Z',assetValueKRW:140000,twrIndex:100,netFlowKRW:70000,cumulativeNetFlowKRW:70000,cumulativeProfitKRW:70000,active:true,final:true},
  {date:'2026-09-18',cutoffAt:'2026-09-18T14:59:59Z',assetValueKRW:280000,twrIndex:105,netFlowKRW:70000,cumulativeNetFlowKRW:140000,cumulativeProfitKRW:140000,active:true,final:true},
 ];
 const {PerformanceAnalytics}=loadTypescript('src/components/PerformanceAnalytics.tsx',{
  '@/hooks/usePerformanceHistory':{usePerformanceHistory:()=>({points,loading:false,error:null,refreshError:null,scopeKey:'currency-test',trackingStartedAt:'2026-09-17T00:00:00Z'})},
  '@/hooks/usePortfolio':{useTransactions:()=>({transactions:[]}),usePreferences:()=>({displayCurrency:currency}),usePortfolioMarket:()=>({summary,currentUsdKrwRate})},
  '@/features/market/use-stock-search':{useStockSearch:()=>({results:[],loading:false})},
  '@/features/performance/use-benchmark-series':{useBenchmarkSeries:()=>({benchmarks:[],retry:()=>{}})},
  '@/features/performance/Charts':{PORTFOLIO_LINE,AssetChart:(props)=>{chartProps=props;return null;},ReturnChart:()=>null},
 });
 const dollars=render(PerformanceAnalytics);
 assert.equal(chartProps.currency,'USD');
 assert.deepEqual(Array.from(chartProps.data,p=>p.assetValue),[100,200]);
 assert.deepEqual(Array.from(chartProps.data,p=>p.cumulativeNetFlowKRW),[70000,140000]);
 assert.ok(chartProps.data.every(p=>!('cumulativeNetFlow' in p)));
 assert.match(dollars,/USD · 현재 환율 환산/);assert.match(dollars,/원화 기준/);
 assert.match(dollars,/보유자산 추이/);assert.doesNotMatch(dollars,/누적 순투입금|보유분 평가손익 · KRW/);
 summary={holdings:[{currency:'USD',valuationAvailable:true,gainAvailable:false,currentFxRateToKRW:0,marketValueKRW:0,marketValueUSD:200}],stockPriceImpactKRW:999999,fxImpactKRW:999999};
 currentUsdKrwRate=null;
 const missingFx=render(PerformanceAnalytics);
 assert.equal(chartProps.currency,'KRW');assert.equal(chartProps.data[1].assetValue,280000);
 assert.match(missingFx,/달러 환율 확인 필요/);assert.doesNotMatch(missingFx,/보유분 평가손익 · KRW|999,999/);
 currency='KRW';
 assert.doesNotMatch(render(PerformanceAnalytics),/달러 환율 확인 필요|현재 환율 환산/);
});

test('integrated asset chart only plots held assets and labels their exact tooltip value',()=>{
 const lines=[];const areas=[];const endpoints=[];let tooltip;
 const wrap=({children})=>createElement('div',null,children);
 const {AssetChart}=loadTypescript('src/features/performance/Charts.tsx',{
  recharts:{ResponsiveContainer:wrap,ComposedChart:wrap,LineChart:wrap,CartesianGrid:()=>null,XAxis:()=>null,YAxis:()=>null,ReferenceArea:()=>null,ReferenceLine:()=>null,ReferenceDot:(props)=>{endpoints.push(props);return null;},Area:(props)=>{areas.push(props);return null;},Line:(props)=>{lines.push(props);return null;},Tooltip:(props)=>{tooltip=props;return null;}},
 });
 render(AssetChart,{data:[{date:'2026-09-18',assetValue:200,cumulativeNetFlow:100}],inactivePeriods:[],currency:'USD'});
 assert.equal(areas[0].dataKey,'assetValue');assert.equal(areas[0].dot,false);assert.equal(lines.length,0);
 assert.equal(endpoints.length,1);assert.equal(endpoints[0].r,4);assert.equal(endpoints[0].x,Date.parse('2026-09-18'));assert.equal(endpoints[0].y,200);
 assert.equal(tooltip.formatter(200,'assetValue')[1],'보유자산');
 assert.match(tooltip.formatter(200,'assetValue')[0],/\$200/);
});
test('signed-out private routes show a login without a fictional portfolio preview',()=>{
 let pathname='/portfolio';
 const {AuthGate}=loadTypescript('src/components/AuthGate.tsx',{'next/navigation':{usePathname:()=>pathname},'@/hooks/useAuth':{useAuth:()=>({user:null,loading:false,configured:true,signInWithGoogle:async()=>null})},'@/app/auth.css':{}});
 const html=render(AuthGate,{children:'PRIVATE_RECORDS'});assert.match(html,/Google로 계속하기/);assert.doesNotMatch(html,/PRIVATE_RECORDS|샘플|24,860,000|cf-auth-preview/);
 pathname='/';assert.equal(render(AuthGate,{children:'PUBLIC_MARKET'}),'PUBLIC_MARKET');
});
