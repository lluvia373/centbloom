import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadTypescript } from './load-typescript.mjs';

const nodes=value=>Array.isArray(value)?value.flatMap(nodes):React.isValidElement(value)?[value,...nodes(value.props.children)]:[];
const text=value=>Array.isArray(value)?value.map(text).join(''):React.isValidElement(value)?text(value.props.children):typeof value==='string'?value:'';

function pageHarness() {
 const state=[];let cursor=0,tree,focusCount=0,refreshCount=0,quoteRefreshCount=0;
 const input={items:[],ready:true,error:null,pending:false,refreshing:false,quotes:{},quotesLoading:false,
  quotesRefreshing:false,failedSymbols:[],refresh:()=>{refreshCount++;},refreshQuotes:()=>{quoteRefreshCount++;},
  addItem:async()=>null,removeItem:()=>null,setTarget:()=>null};
 const observed={rows:[],search:null};
 const searchRef={current:{focus(){focusCount++;}}};
 const {default:Page}=loadTypescript('src/app/watchlist/page.tsx',{
  react:{...React,useEffect:()=>{},useRef:()=>searchRef,useState:initial=>{
   const index=cursor++;if(!(index in state))state[index]=initial;
   return [state[index],value=>{state[index]=typeof value==='function'?value(state[index]):value;}];
  }},
  '@/hooks/useWatchlist':{useWatchlist:()=>input},
  '@/features/notifications/NotificationProvider':{useNotificationInbox:()=>null},
  '@/features/watchlist/WatchlistSearch':{WatchlistSearch:props=>{observed.search=props;return createElement('div',null,'ADD_SEARCH');}},
  '@/features/watchlist/WatchlistRow':{WatchlistRow:props=>{observed.rows.push(props);return createElement('article',null,`ROW_${props.item.symbol}`);}},
 });
 return {input,observed,draw(){cursor=0;observed.rows=[];tree=Page();return renderToStaticMarkup(tree);},
  button:label=>nodes(tree).find(node=>node.type==='button'&&(node.props['aria-label']===label||text(node)===label)),
  focusCount:()=>focusCount,refreshCount:()=>refreshCount,quoteRefreshCount:()=>quoteRefreshCount};
}

test('empty watchlist leaves one empty state and an add-search entry instead of three zero summaries',()=>{
 const h=pageHarness();const html=h.draw();
 assert.equal((html.match(/관심종목 없음/g)||[]).length,1);
 assert.match(html,/ADD_SEARCH/);
 assert.doesNotMatch(html,/지켜보는 종목|설정한 목표가|목표가에 도달한 종목|내 관심종목|최대 50개|시세 새로고침/);
 assert.equal(h.observed.search.ready,true);
 h.button(' 관심종목 추가').props.onClick();assert.equal(h.focusCount(),1);
});

test('watchlist loading and read failure never appear as an empty saved list',()=>{
 const h=pageHarness();h.input.ready=false;
 const loading=h.draw();
 assert.match(loading,/role="status"[^>]*>관심종목 불러오는 중/);
 assert.doesNotMatch(loading,/관심종목 없음|지켜보는 종목|최대 50개/);
 assert.equal(h.observed.search.ready,false);
 h.input.error='관심종목을 불러오지 못했습니다.';
 const failed=h.draw();
 assert.match(failed,/role="alert"/);assert.match(failed,/다시 불러오기/);
 assert.doesNotMatch(failed,/관심종목 없음|관심종목 불러오는 중|aria-label="관심종목 목록"/);
 h.button('다시 불러오기').props.onClick();assert.equal(h.refreshCount(),1);
 h.input.ready=true;
 assert.doesNotMatch(h.draw(),/관심종목 없음/,'ready with a failure is not a confirmed empty list');
});

test('populated watchlists retain target uncertainty, row actions and quote retries without a title count',()=>{
 const h=pageHarness();
 const item={symbol:'AAPL',name:'Apple Inc.',targetPrice:150,targetCurrency:'USD'};
 h.input.items=[item];h.input.quotes={AAPL:{price:100,currency:'USD'}};
 let removed,target;
 h.input.removeItem=symbol=>{removed=symbol;return null;};
 h.input.setTarget=(...args)=>{target=args;return null;};
 const ready=h.draw();
 assert.match(ready,/<h2[^>]*>내 관심종목<\/h2>/);
 assert.doesNotMatch(ready,/<h2[^>]*>내 관심종목<\/h2>\s*<span/);
 assert.match(ready,/목표가에 도달한 종목<\/p><p[^>]*>1<span/);
 assert.equal(h.observed.rows[0].item,item);assert.equal(h.observed.rows[0].failed,false);
 h.observed.rows[0].onRemove();assert.equal(removed,'AAPL');
 h.observed.rows[0].onTarget(120,'USD');assert.deepEqual(target,['AAPL',120,'USD']);
 h.button(' 시세 새로고침').props.onClick();assert.equal(h.quoteRefreshCount(),1);
 for(const unavailable of ['failed','currency','loading']){
  h.input.failedSymbols=unavailable==='failed'?['AAPL']:[];
  h.input.quotes.AAPL.currency=unavailable==='currency'?'KRW':'USD';
  h.input.quotesLoading=unavailable==='loading';
  const html=h.draw();
  assert.match(html,/목표가에 도달한 종목<\/p><p[^>]*>—<span/);
  if(unavailable==='failed'){
   assert.equal(h.observed.rows[0].failed,true);assert.match(html,/1개 종목의 시세를 확인하지 못했어요/);
  }
 }
 h.input.quotesRefreshing=true;h.draw();assert.equal(h.button(' 시세 새로고침').props.disabled,true);
});

test('watchlist saving and retry states remain distinct and notices can be dismissed',()=>{
 const h=pageHarness();h.input.pending=true;h.input.error='저장하지 못했습니다.';
 let html=h.draw();assert.match(html,/저장 중…/);assert.match(html,/저장하지 못했습니다/);
 assert.equal(h.observed.search.ready,false);assert.equal(h.button('다시 불러오기').props.disabled,true);
 h.input.pending=false;h.draw();assert.equal(h.button('다시 불러오기').props.disabled,false);
 h.observed.search.setNotice('추가 완료');html=h.draw();assert.match(html,/추가 완료/);
 h.button('메시지 닫기').props.onClick();assert.doesNotMatch(h.draw(),/추가 완료/);
});

function searchHarness() {
 const state=[];let cursor=0,tree,focusCount=0;
 const search={results:[],loading:false,error:null};const notices=[];
 const observed={};
 const input={items:[],ready:true,addItem:async()=>null,setNotice:message=>notices.push(message),searchInput:{current:{focus(){focusCount++;}}}};
 const {WatchlistSearch}=loadTypescript('src/features/watchlist/WatchlistSearch.tsx',{
  react:{...React,useState:initial=>{const index=cursor++;if(!(index in state))state[index]=initial;
   return [state[index],value=>{state[index]=typeof value==='function'?value(state[index]):value;}];}},
  '@/components/AssetAvatar':{AssetAvatar:()=>null},
  '@/components/MarketPicker':{MarketPicker:props=>{observed.market=props;return null;}},
  '@/features/market/use-stock-search':{useStockSearch:(query,options)=>{observed.query=query;observed.options=options;return search;}},
 });
 return {input,search,notices,observed,draw(){cursor=0;tree=WatchlistSearch(input);return renderToStaticMarkup(tree);},
  field:()=>nodes(tree).find(node=>node.type==='input'),
  button:label=>nodes(tree).find(node=>node.type==='button'&&node.props['aria-label']===label),
  focusCount:()=>focusCount};
}

test('watchlist search has a visible purpose label, no market sentence and keeps clear-search focus',()=>{
 const h=searchHarness();const html=h.draw();
 assert.match(html,/<label[^>]*for="watchlist-search"[^>]*>관심종목에 추가할 종목 검색<\/label>/);
 assert.equal(h.field().props.id,'watchlist-search');assert.equal(h.field().props.ref,h.input.searchInput);
 assert.doesNotMatch(html,/한국 · 미국 · 일본 · 홍콩 · 중국|검색 결과 없음/);
 h.field().props.onChange({target:{value:'Apple'}});h.draw();
 assert.equal(h.observed.query,'Apple');assert.equal(h.observed.options.limit,8);
 h.observed.market.onChange('us');h.draw();assert.equal(h.observed.options.market,'us');
 h.button('검색어 지우기').props.onClick();h.draw();
 assert.equal(h.field().props.value,'');assert.equal(h.focusCount(),1);
});

test('watchlist search distinguishes loading, failed lookup and no matches',()=>{
 const h=searchHarness();h.draw();h.field().props.onChange({target:{value:'missing'}});
 h.search.loading=true;let html=h.draw();assert.match(html,/role="status"[^>]*>.*종목 검색 중/s);assert.doesNotMatch(html,/검색 결과 없음/);
 h.search.loading=false;h.search.error='검색을 완료하지 못했습니다.';
 html=h.draw();assert.match(html,/role="alert"[^>]*>검색을 완료하지 못했습니다/);assert.doesNotMatch(html,/검색 결과 없음/);
 h.search.error=null;html=h.draw();assert.match(html,/검색 결과 없음/);assert.doesNotMatch(html,/관심종목 없음/);
});

test('watchlist additions stay disabled until ready and preserve failed queries before a successful retry',async()=>{
 const h=searchHarness();const stock={symbol:'AAPL',name:'Apple Inc.',exchange:'NASDAQ'};
 h.search.results=[stock];h.draw();h.field().props.onChange({target:{value:'Apple'}});
 h.input.ready=false;h.draw();assert.equal(h.button('Apple Inc. 관심종목 추가').props.disabled,true);
 h.input.ready=true;h.input.items=[{symbol:'AAPL'}];h.draw();assert.equal(h.button('Apple Inc. 관심종목 추가됨').props.disabled,true);
 h.input.items=[];let resolveSave,submitted;
 h.input.addItem=value=>{submitted=value;return new Promise(resolve=>{resolveSave=resolve;});};
 h.draw();const save=h.button('Apple Inc. 관심종목 추가').props.onClick();h.draw();
 assert.equal(submitted,stock);assert.equal(h.button('Apple Inc. 관심종목 저장 중…').props.disabled,true);
 resolveSave('저장하지 못했습니다. 다시 시도해 주세요.');await save;h.draw();
 assert.equal(h.field().props.value,'Apple');assert.equal(h.button('Apple Inc. 관심종목 추가').props.disabled,false);
 assert.match(h.notices.at(-1),/저장하지 못했습니다/);assert.equal(h.focusCount(),0);
 h.input.addItem=async()=>null;h.draw();await h.button('Apple Inc. 관심종목 추가').props.onClick();h.draw();
 assert.equal(h.field().props.value,'');assert.equal(h.focusCount(),1);assert.match(h.notices.at(-1),/추가했어요/);
});

test('changed watchlist surfaces use shared tokens and controls without decorative market prose',()=>{
 for(const path of ['src/app/watchlist/page.tsx','src/features/watchlist/WatchlistSearch.tsx']){
  const source=readFileSync(path,'utf8');
  assert.doesNotMatch(source,/#(?:[\da-f]{3}){1,2}\b|text-\[\d+px\]|shadow-sm|rounded-2xl/);
  assert.match(source,/button-secondary/);assert.match(source,/rounded-cf-card/);
 }
});
