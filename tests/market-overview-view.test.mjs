import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {createElement} from 'react';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTypescript} from './load-typescript.mjs';

const now = Date.parse('2026-09-23T02:00:00Z');
const symbolsOf=html=>Array.from(html.matchAll(/data-symbol="([^"]+)"/g),match=>match[1]);
function panel({quotes={},failedSymbols=[],initialNow=now,selection}={}) {
 let subscribed;
 let clock=initialNow;
 let state=selection;
 const {MarketOverview}=loadTypescript('src/features/market/MarketOverview.tsx',{
  react:{...React,useId:()=> 'market-panel-test',useState:initial=>{
   state ??= initial;
   return [state,next=>{state=typeof next==='function'?next(state):next;}];
  }},
  './use-market-clock':{useMarketClock:()=>clock},
  '@/hooks/useLiveQuotes':{useLiveQuotes:symbols=>{subscribed=Array.from(symbols);return {quotes,failedSymbols};}},
  './MarketOverview.module.css':{default:{up:'up',down:'down',flat:'flat',price:'price',pending:'pending'}},
  './home.module.css':{default:{}},
 });
 const tree=()=>MarketOverview({initialNow});
 return {
  tree,
  render:()=>({html:renderToStaticMarkup(tree()),symbols:subscribed}),
  select:id=>tree().props.children[0].props.children.find(button=>button.key===id).props.onClick(),
  next:()=>tree().props.actions.props.children[2].props.onClick(),
  previous:()=>tree().props.actions.props.children[0].props.onClick(),
  setClock:value=>{clock=value;},
  setQuotes:value=>{quotes=value;},
  get selection(){return state;},
 };
}
const render=(quotes={},failedSymbols=[],initialNow=now,selection)=>panel({quotes,failedSymbols,initialNow,selection}).render();

test('home panel requests all 18 instruments once, displays two, and never fabricates missing prices',()=>{
 const {html,symbols}=render({},['^KS11']);
 const {tickerSymbols}=loadTypescript('src/features/market/ticker-instruments.ts');
 assert.deepEqual(symbols,Array.from(tickerSymbols));
 assert.equal(new Set(symbols).size,18);
 assert.equal(symbols.filter(symbol=>symbol.endsWith('=X')).join(','),'USDKRW=X');
 assert.deepEqual(symbolsOf(html),['^KS11','^KQ11']);
 assert.match(html,/주요 시장/);
 assert.match(html,/조회 불가/);
 assert.match(html,/시세 불러오는 중/);
 const pending=Array.from(html.matchAll(/<strong class="pending">([^<]+)<\/strong>/g),match=>match[1]);
 assert.deepEqual(pending,['조회 불가','—']);
 assert.doesNotMatch(html,/<strong class="price">|aria-hidden="true"[^>]*inert|좌우로 스크롤/);
});

test('quote time and stale state are distinct from current exchange schedule',()=>{
 const quote={price:1234.56,changePercent:1.23,quotedAt:'2026-09-04T06:30:00Z',marketState:'CLOSED',delayMinutes:20};
 const {html}=render({'^KS11':quote,'^KQ11':{...quote,changePercent:-2.34}},['^KS11']);
 assert.match(html,/1,234.56/);
 assert.match(html,/\+1.23%/);
 assert.match(html,/-2.34%/);
 assert.match(html,/갱신 실패, 이전 가격/);
 assert.match(html,/장 마감 가격 · 20분 지연 · 9\. 4\. 15:30 KST 기준/);
 assert.match(html,/>이전</);
 assert.match(html,/data-open="true"/); // KR schedule stays open even when the quote is old.
 assert.match(html,/한국 · /);
 const neutral=render({'^GSPC':{...quote,changePercent:0}},[],now,{id:'us',page:0}).html;
 assert.match(neutral,/<span class="flat">0.00%<\/span>/);
});

test('reference pages preserve VIX context and Treasury percent/bp without cash-equity session claims',()=>{
 const {formatTickerQuote}=loadTypescript('src/features/market/ticker-instruments.ts');
 assert.equal(formatTickerQuote('^TNX',{price:4.76,change:-0.01,changePercent:-0.21}).change,'-1.00bp');
 const vix=render({},[],now,{id:'reference',page:0}).html;
 assert.deepEqual(symbolsOf(vix),['^VIX','^STOXX50E']);
 assert.match(vix,/상승은 주가 상승을 뜻하지 않음/);
 const yields=render({'^TNX':{price:4.784,change:0.022,changePercent:0.46}},[],now,{id:'reference',page:1}).html;
 assert.deepEqual(symbolsOf(yields),['^TNX','DX-Y.NYB']);
 assert.match(yields,/4.784%/);
 assert.match(yields,/\+2.20bp/);
 assert.match(yields,/국채 수익률/);
 for(const html of [vix,yields]) {
  assert.match(html,/>참고 지표</);
  assert.doesNotMatch(html,/data-open="true"/);
 }
});

test('featured instruments keep their schedule order regardless of quote changes',()=>{
 const loading=symbolsOf(render().html);
 const changed=symbolsOf(render({'^GSPC':{price:1,changePercent:500},'^KS11':{price:1,changePercent:-90}}).html);
 assert.deepEqual(changed,loading);
 assert.deepEqual(changed,['^KS11','^KQ11']);
});

test('weekend and unsupported calendar year use explicit fallback labels and index context',()=>{
 const weekend=render({},[],Date.parse('2026-09-20T02:00:00Z')).html;
 assert.match(weekend,/aria-label="최근 마감 지수"/);
 assert.match(weekend,/9\. 19\. 마감/);
 const unknown=render({},[],Date.parse('2027-01-04T02:00:00Z')).html;
 assert.match(unknown,/aria-pressed="true"[^>]*>대표</);
 assert.match(unknown,/기본 대표 지수/);
 assert.match(unknown,/일정 확인 중/);
 assert.deepEqual(symbolsOf(unknown),['^GSPC','^IXIC']);
});

test('shared header retains stock search but has no quote subscription or index strip',()=>{
 let quoteCalls=0;
 const {Header}=loadTypescript('src/components/Header.tsx',{
  'next/navigation':{usePathname:()=>'/portfolio'},
  '@/features/navigation':{primaryNavigation:[],navigationArea:()=>null},
  '@/features/navigation/HeaderAccountControls':{HeaderAccountControls:()=>createElement('button',null,'계정 메뉴')},
  '@/features/market/MarketHeader.module.css':{default:{}},
  '@/components/BrandMark':{BrandMark:()=>null},
  '@/features/home/StockDiscovery':{StockDiscovery:()=>createElement('input',{'aria-label':'공통 종목 검색'})},
  '@/hooks/useAuth':{useAuth:()=>({user:null,configured:false})},
  '@/hooks/usePortfolio':{},
  '@/hooks/useLiveQuotes':{useLiveQuotes:()=>{quoteCalls++;return {quotes:{},failedSymbols:[]};}},
 });
 const html=renderToStaticMarkup(createElement(Header));
 assert.match(html,/<header[^>]*aria-label="종목 검색과 계정"/);
 assert.match(html,/공통 종목 검색/);
 assert.doesNotMatch(html,/data-symbol|세계 주요 지수|주요 시장/);
 assert.equal(quoteCalls,0);
 assert.equal(existsSync('src/features/market/use-ticker-motion.ts'),false);
 assert.doesNotMatch(readFileSync('src/features/market/MarketOverview.module.css','utf8'),/animation|scroll-behavior|transform/);
});

test('home slots stream changes/news independently and never delay market, rankings or calendar',async()=>{
 const preparedReads={changes:0,news:0};
 let resolveChanges,resolveNews;
 const component=()=>null;
 const {default:HomePage}=loadTypescript('src/app/page.tsx',{
  'next/server':{connection:async()=>{}},
  '@/features/market/server/changes-response':{initialChanges:()=>{preparedReads.changes++;return new Promise(resolve=>{resolveChanges=resolve;});}},
  '@/features/market/server/news-response':{initialNews:()=>{preparedReads.news++;return new Promise(resolve=>{resolveNews=resolve;});}},
  '@/features/home/DiscoveryShortcuts':{DiscoveryShortcuts:component},
  '@/features/home/MarketNews':{MarketNews:component},
  '@/features/home/MarketMovers':{MarketMovers:component},
  '@/features/home/MarketChanges':{MarketChanges:component},
  '@/features/home/MarketCalendar':{MarketCalendar:component},
  '@/features/home/MarketSessions':{MarketSessions:component},
  '@/features/market/MarketOverview':{MarketOverview:component},
  '@/features/home/ResearchDesk':{ResearchDesk:component},
  '@/features/home/HomeLayout':{HomeLayout:component},
  '@/features/home/home.module.css':{default:{}},
 });
 const home=await HomePage();
 assert.deepEqual(preparedReads,{changes:0,news:0});
 const layout=home.props.children[2];
 const {market:marketPanel,changes:changesBoundary,news:newsBoundary}=layout.props;
 assert.equal(marketPanel.type,component);
 assert.equal(typeof marketPanel.props.initialNow,'number');
 assert.equal(layout.props.rankings.type,component);
 assert.equal(layout.props.rankings.props.compact,true);
 assert.equal(layout.props.calendar.type,component);
 for(const boundary of [changesBoundary,newsBoundary]) {
  assert.equal(boundary.type,React.Suspense);
  assert.equal(boundary.props.fallback.props.role,'status');
 }
 const changesNode=changesBoundary.props.children;
 const changesPending=changesNode.type(changesNode.props);
 assert.deepEqual(preparedReads,{changes:1,news:0});
 const newsNode=newsBoundary.props.children;
 const newsPending=newsNode.type(newsNode.props);
 assert.deepEqual(preparedReads,{changes:1,news:1});
 resolveChanges(null);
 const changes=await changesPending;
 assert.equal(changes.props.pageSize,undefined);
 resolveNews(null);
 await newsPending;
});

test('home layout preserves one DOM tree and measures independent stacks without empty rows',()=>{
  const {HomeLayout,homeColumnPositions}=loadTypescript('src/features/home/HomeLayout.tsx',{
   react:{...React,useRef:()=>({current:null}),useLayoutEffect:()=>{}},
   './home-layout.module.css':{default:{}},
  });
  const names=['market','changes','rankings','calendar','news','utilities'];
  const slots=Object.fromEntries(names.map(name=>[name,createElement('section',{'data-slot':name})]));
  const html=renderToStaticMarkup(HomeLayout(slots));
  const order=Array.from(html.matchAll(/data-slot="([^"]+)"/g),match=>match[1]);
  assert.deepEqual(order,[...names.flatMap(name=>[name,name])]); // slot wrapper and test section
  assert.equal(new Set(order).size,names.length);
  const positions=homeColumnPositions({market:270,changes:650,rankings:530,calendar:300,news:1000,utilities:0},24);
  assert.equal(positions.tops.rankings,674);
  assert.equal(positions.tops.calendar,294);
  assert.equal(positions.tops.news,1228);
  assert.equal(positions.height,2228);
  const empty=homeColumnPositions({market:270,changes:0,rankings:530,calendar:0,news:1000,utilities:100},24);
  assert.equal(empty.tops.rankings,0);
  assert.equal(empty.tops.utilities,294);
});

test('list identity, region controls and focus slots stay stable across schedule, quote and selection changes',()=>{
 const view=panel({initialNow:Date.parse('2026-09-23T06:29:59Z')});
 const inspect=()=>{
  const tree=view.tree();
  const [regions,list]=tree.props.children;
  const controls=[...regions.props.children,tree.props.actions.props.children[0],tree.props.actions.props.children[2]];
  assert.ok(controls.every(button=>button.props['aria-controls']===list.props.id));
  return {id:list.props.id,listType:list.type,regionKeys:Array.from(regions.props.children,button=>button.key),slots:Array.from(list.props.children,item=>[item.key,item.type])};
 };
 const before=inspect();
 view.setClock(Date.parse('2026-09-23T06:30:00Z'));
 assert.deepEqual(inspect(),before);
 view.setQuotes({'^HSI':{price:10,changePercent:1}});
 assert.deepEqual(inspect(),before);
 view.select('us');
 assert.deepEqual(inspect(),before);
});

test('seeded region pages render the three US pairs and the final Asia singleton',()=>{
 for(const [page,expected] of [[0,['^GSPC','^IXIC']],[1,['^NDX','^DJI']],[2,['^RUT','^SOX']]]) {
  const {html,symbols}=render({},[],now,{id:'us',page});
  assert.deepEqual(symbolsOf(html),expected);
  assert.equal(symbols.length,18);
  assert.match(html,new RegExp(`미국 페이지 </span>${page+1}/3`));
 }
 const lastAsia=render({},[],now,{id:'asia',page:2}).html;
 assert.deepEqual(symbolsOf(lastAsia),['000001.SS']);
 assert.match(lastAsia,/아시아 페이지 <\/span>3\/3/);
 assert.match(lastAsia,/aria-label="다음 지수"[^>]*disabled=""/);
});

test('region and previous/next buttons navigate manually and reset the page on region selection',()=>{
 const view=panel();
 view.select('us');
 assert.deepEqual(symbolsOf(view.render().html),['^GSPC','^IXIC']);
 assert.equal(view.tree().props.actions.props.children[0].props.disabled,true);
 view.next();
 assert.deepEqual(symbolsOf(view.render().html),['^NDX','^DJI']);
 view.next();
 assert.deepEqual(symbolsOf(view.render().html),['^RUT','^SOX']);
 assert.equal(view.tree().props.actions.props.children[2].props.disabled,true);
 view.previous();
 assert.deepEqual(symbolsOf(view.render().html),['^NDX','^DJI']);
 view.select('asia');
 assert.equal(view.selection.id,'asia');
 assert.equal(view.selection.page,0);
 assert.deepEqual(symbolsOf(view.render().html),['^KS11','^KQ11']);
});

test('explicit region and page selections remain in place when the clock and quote values change',()=>{
 const view=panel({selection:{id:'us',page:1}});
 const before=view.render();
 view.setClock(Date.parse('2026-09-23T14:00:00Z'));
 view.setQuotes({'^NDX':{price:123,changePercent:99}});
 const after=view.render();
 assert.deepEqual(symbolsOf(after.html),symbolsOf(before.html));
 assert.deepEqual(symbolsOf(after.html),['^NDX','^DJI']);
 assert.equal(view.selection.id,'us');
 assert.equal(view.selection.page,1);
 assert.deepEqual(after.symbols,before.symbols);
 assert.match(after.html,/aria-pressed="true"[^>]*>미국</);
 assert.match(after.html,/\+99.00%/);
});

test('movement cards honor the two-card page size without changing the default three-card size',()=>{
 const items=Array.from({length:5},(_,index)=>({
  quote:{symbol:`TEST${index}`,name:`Company ${index}`,price:100,currency:'USD',changePercent:2},
  signals:[{kind:'price',value:2,baseline:1,ratio:2}],sessionDate:'2026-09-22',
  story:{url:'https://example.com/news',title:'Company news',publisher:'Publisher',publishedAt:'2026-09-22T12:00:00Z'},
 }));
 let currentPage=0;
 const {MarketChanges}=loadTypescript('src/features/home/MarketChanges.tsx',{
  react:{...React,useId:()=> 'movement-list',useState:initial=>[initial===0?currentPage:initial,()=>{}]},
  'next/link':{default:()=>null},
  '@/components/AssetAvatar':{AssetAvatar:()=>null},
  '@/features/watchlist/WatchStockButton':{WatchStockButton:()=>null},
  '@/features/market/use-market-changes':{useMarketChanges:()=>({data:{items},failed:false})},
  '@/hooks/useWatchlist':{useWatchlist:()=>({items:[]})},
  '@/features/market/use-watched-reports':{useWatchedReports:()=>[]},
  '@/features/market/personalized-changes':{mergeWatchedChanges:items=>items,selectPersonalizedChanges:items=>items},
  '@/features/market/market-changes':{changeKinds:['price'],changeLabels:{price:'가격'},changeObservation:()=>({headline:'Observed change'})},
  './home.module.css':{default:{}},
  './market-changes.module.css':{default:{}},
 });
 const cards=props=>Array.from(MarketChanges(props).props.children[2].props.children,card=>card.key);
 assert.deepEqual(cards({}),['TEST0','TEST1','TEST2']);
 assert.deepEqual(cards({pageSize:2}),['TEST0','TEST1']);
 currentPage=1;
 assert.deepEqual(cards({pageSize:2}),['TEST2','TEST3']);
 currentPage=2;
 assert.deepEqual(cards({pageSize:2}),['TEST4']);
});
