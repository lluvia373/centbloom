import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React, {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTypescript} from './load-typescript.mjs';
const render=(component,props={})=>renderToStaticMarkup(createElement(component,props));
const portfolioLine={key:'portfolioReturn',name:'내 수익률',color:'var(--cf-color-chart)'};

test('search spinner centers through layout without a rotating translation offset',()=>{
 const css=readFileSync(new URL('../src/styles/portfolio.css',import.meta.url),'utf8');
 const placement=css.match(/\.performance-search-icon,\s*\.performance-search-loading\s*\{([^}]+)\}/)?.[1];
 assert.ok(placement);
 for(const declaration of [/top:\s*0\s*;/,/bottom:\s*0\s*;/,/margin-block:\s*auto\s*;/]) assert.match(placement,declaration);
 assert.doesNotMatch(placement,/(?:transform|translate)\s*:/);
 assert.match(css,/@keyframes performance-spin\s*\{\s*to\s*\{\s*rotate:\s*360deg;/);
});

test('period performance removes provider explanations while retaining reference FX metadata',()=>{
 let points=[{date:'2026-09-20',cutoffAt:'2026-09-20T23:59:59+09:00',assetValueKRW:100,
  twrIndex:100,netFlowKRW:0,cumulativeNetFlowKRW:0,cumulativeProfitKRW:0,active:true,final:true,
  fxReferences:{CNY:'2026-09-18'}}];
 let data;
 const {PerformanceAnalytics}=loadTypescript('src/components/PerformanceAnalytics.tsx',{
  '@/hooks/usePerformanceHistory':{usePerformanceHistory:()=>({points,trackingStartedAt:'2026-09-20T00:00:00Z',loading:false,error:null})},
  '@/hooks/usePortfolio':{useTransactions:()=>({transactions:[]}),usePreferences:()=>({displayCurrency:'KRW'}),usePortfolioMarket:()=>({summary:null})},
  '@/features/market/use-stock-search':{useStockSearch:()=>({results:[],loading:false})},
  '@/features/performance/use-benchmark-series':{useBenchmarkSeries:()=>({benchmarks:[],retry:()=>{}})},
  '@/features/performance/Charts':{AssetChart:props=>{data=props.data;return null;},ReturnChart:()=>null,PORTFOLIO_LINE:portfolioLine},
 });
 const html=render(PerformanceAnalytics);
 assert.doesNotMatch(html,/ECB|일별 기준환율 적용|일별 성과|보유분 평가손익|Modified Dietz|<details|<summary|23:59:59|추정|직접 선택/);
 assert.doesNotMatch(html,/<h2[^>]*>기간 성과<\/h2>/);
 assert.match(html,/<dt>기간 손익<span/);assert.doesNotMatch(html,/기간 수익률|performance-metric-return/);
 assert.match(html,/원화 기준/);assert.doesNotMatch(html,/운용 수익률|내 자금 수익률|자금 이동 영향 제외|투입 금액·기간 반영/);
 assert.equal((html.match(/<dt>/g)||[]).length,1);
 assert.match(html,/aria-label="차트 범례"/);assert.match(html,/>보유자산 추이<\/button>/);
 assert.doesNotMatch(html,/누적 순투입금|순입금|현금 잔액/);
 assert.match(html,/aria-label="보유자산 추이 그래프"/);
 assert.equal(data[0].fxReferences.CNY,'2026-09-18');assert.equal(points[0].fxReferences.CNY,'2026-09-18');
 points=[{...points[0],fxReferences:undefined}];
 assert.doesNotMatch(render(PerformanceAnalytics),/일별 기준환율 적용/);
});

test('both chart tooltips show date and numeric values without FX diagnostics or dropping metadata',()=>{
 let tooltip;let chartData;let plottedKeys=[];
 const wrap=({children,data})=>{if(data)chartData=data;return createElement('svg',null,children);};
 const {AssetChart,ReturnChart}=loadTypescript('src/features/performance/Charts.tsx',{
  recharts:{ResponsiveContainer:wrap,ComposedChart:wrap,LineChart:wrap,CartesianGrid:()=>null,XAxis:()=>null,YAxis:()=>null,ReferenceArea:()=>null,ReferenceLine:()=>null,ReferenceDot:()=>null,Area:props=>{plottedKeys.push(props.dataKey);return null;},Line:props=>{plottedKeys.push(props.dataKey);return null;},Tooltip:props=>{tooltip=props;return null;}},
 });
 const data=[{date:'2026-09-20',fxReferences:{USD:'2026-09-18',CNY:'2026-09-17'}}];
 for(const chart of [AssetChart,ReturnChart]){
  plottedKeys=[];
  render(chart,{data,inactivePeriods:[],currency:'USD',comparisons:[{key:'benchmark_0',name:'SPY',color:'var(--cf-color-comparison-1)'}]});
  assert.equal(tooltip.labelFormatter('2026-09-20',[{payload:data[0]}]),'2026.09.20');
  assert.equal(tooltip.labelFormatter(Date.parse('2026-09-20')),'2026.09.20');
  assert.equal(chartData[0].date,data[0].date);assert.equal(chartData[0].timestamp,Date.parse('2026-09-20'));
  assert.equal(chartData[0].fxReferences.CNY,'2026-09-17');assert.equal(data[0].timestamp,undefined);
  if(chart===AssetChart){assert.match(tooltip.formatter(100,'assetValue')[0],/\$100\.00$/);assert.equal(tooltip.formatter(100,'assetValue')[1],'보유자산');assert.deepEqual(plottedKeys,['assetValue']);}
  else{assert.equal(tooltip.formatter(5,'portfolioReturn')[1],'내 수익률');assert.equal(tooltip.formatter(5,'benchmark_0')[1],'SPY 참고 수익률');assert.match(tooltip.formatter(5,'portfolioReturn')[0],/5\.00%/);assert.deepEqual(plottedKeys,['portfolioReturn','benchmark_0']);}
 }
});

test('comparison charts keep solid unsmoothed lines and highlight one without deleting others or filling gaps',()=>{
 let plotted=[];let xAxis;let yAxis;let chartData;const referenceLines=[];
 const wrap=({children,data})=>{if(data)chartData=data;return createElement('svg',null,children);};
 const {ReturnChart}=loadTypescript('src/features/performance/Charts.tsx',{
  recharts:{ResponsiveContainer:wrap,LineChart:wrap,XAxis:props=>{xAxis=props;return null;},YAxis:props=>{yAxis=props;return null;},ReferenceArea:()=>null,ReferenceDot:()=>null,ReferenceLine:props=>{referenceLines.push(props);return null;},Tooltip:()=>null,Line:props=>{plotted.push(props);return null;}},
 });
 const data=[{date:'2024-09-23',portfolioReturn:0,benchmark_0:0,benchmark_1:0},{date:'2025-04-09',portfolioReturn:null,benchmark_0:5,benchmark_1:null},{date:'2026-09-22',portfolioReturn:20,benchmark_0:150,benchmark_1:-40}];
 const before=JSON.stringify(data);
 const comparisons=[{key:'benchmark_0',name:'SPY',color:'indigo'},{key:'benchmark_1',name:'QQQ',color:'blue'}];
 render(ReturnChart,{data,inactivePeriods:[],comparisons,activeKey:'benchmark_1'});
 assert.equal(plotted.length,3);assert.equal(plotted.at(-1).dataKey,'benchmark_1');
 for(const line of plotted){
  assert.equal(line.type,'linear');assert.equal(line.connectNulls,false);assert.equal(line.strokeDasharray,undefined);
  assert.equal(line.isAnimationActive,false);assert.equal(line.strokeOpacity,line.dataKey==='benchmark_1'?1:0.22);
  assert.equal(line.strokeWidth,line.dataKey==='benchmark_1'?3:2.15);
 }
 assert.equal(xAxis.dataKey,'timestamp');assert.equal(xAxis.type,'number');assert.equal(xAxis.scale,'time');
 assert.ok(xAxis.ticks.every(Number.isFinite));assert.equal(xAxis.interval,0);
 assert.ok(yAxis.domain[0]<=-40&&yAxis.domain[1]>=150);
 assert.deepEqual(referenceLines.map(line=>line.y),[0]);
 assert.equal(chartData[1].portfolioReturn,null);assert.equal(chartData[1].benchmark_1,null);assert.equal(JSON.stringify(data),before);
 plotted=[];render(ReturnChart,{data,inactivePeriods:[],comparisons,activeKey:null});
 assert.equal(plotted.length,3);assert.ok(plotted.every(line=>line.strokeOpacity===1));
});

test('asset chart fits its visible values and keeps endpoint date labels inside the plot',()=>{
 let xAxis,yAxis,area;let references=[];
 const wrap=({children})=>createElement('svg',null,children);
 const {AssetChart}=loadTypescript('src/features/performance/Charts.tsx',{
  recharts:{ResponsiveContainer:wrap,ComposedChart:wrap,CartesianGrid:()=>null,
   XAxis:props=>{xAxis=props;return null;},YAxis:props=>{yAxis=props;return null;},
   Area:props=>{area=props;return null;},Tooltip:()=>null,ReferenceArea:()=>null,
   ReferenceLine:props=>{references.push(props);return null;},ReferenceDot:()=>null},
 });
 const data=[{date:'2026-09-16',assetValue:30_100_000},{date:'2026-09-22',assetValue:30_700_000}];
 render(AssetChart,{data,inactivePeriods:[],currency:'KRW'});
 assert.ok(yAxis.domain[0]>29_000_000);assert.equal(yAxis.allowDataOverflow,true);
 assert.equal(area.baseValue,yAxis.domain[0]);assert.equal(area.type,'linear');
 assert.deepEqual(references,[]);assert.equal(xAxis.scale,'time');
 for(const width of [324,1040])for(const [x,value] of [[yAxis.width,Date.parse('2026-09-16')],[width-16,Date.parse('2026-09-22')]]){
  const html=renderToStaticMarkup(React.cloneElement(xAxis.tick,{x,y:300,right:width-16,payload:{value}}));
  const labelX=Number(html.match(/\bx="([\d.]+)"/)[1]);
  assert.ok(labelX>yAxis.width&&labelX<width-16);
  assert.match(html,/9월 (16|22)일/);
 }
 references=[];render(AssetChart,{data:[...data,{date:'2026-09-23',assetValue:0}],inactivePeriods:[],currency:'KRW'});
 assert.equal(yAxis.domain[0],0);assert.deepEqual(references.map(line=>line.y),[0]);
});

test('both charts keep one fixed-height date row without year bands or format-specific baselines',()=>{
 let xAxis,chartData;
 let width=1040;
 const wrap=({children,data})=>{if(data)chartData=data;return createElement('svg',null,children);};
 const {AssetChart,ReturnChart}=loadTypescript('src/features/performance/Charts.tsx',{
  react:{...React,useState:initial=>[typeof initial==='number'?width:{...initial,width,height:280},()=>{}]},
  recharts:{ResponsiveContainer:wrap,ComposedChart:wrap,LineChart:wrap,XAxis:props=>{xAxis=props;return null;},
   YAxis:()=>null,Area:()=>null,Line:()=>null,Tooltip:()=>null,ReferenceArea:()=>null,ReferenceLine:()=>null,ReferenceDot:()=>null},
 });
 const cases=[
  ['2026-09-16','2026-09-22',/^9월 \d+일$/],
  ['2026-07-01','2026-09-22',/^2026년 \d+월$/],
  ['2016-09-23','2026-09-22',/^\d{4}년$/],
  ['2025-12-28','2026-01-08',/^\d{4}년 \d+월 \d+일$/],
 ];
 for(width of [324,1040])for(const chart of [AssetChart,ReturnChart])for(const [first,last,format] of cases){
  const data=[{date:first,assetValue:100,portfolioReturn:0},{date:last,assetValue:110,portfolioReturn:10}];
  const html=render(chart,{data,inactivePeriods:[]});
  assert.equal(xAxis.height,36);assert.equal(xAxis.tickMargin,12);
  assert.equal(xAxis.axisLine,false);assert.equal(xAxis.tickLine,false);
  assert.equal(xAxis.interval,0);assert.equal(xAxis.scale,'time');
  assert.ok(xAxis.ticks.length>0&&xAxis.ticks.length<=6);
  assert.doesNotMatch(html,/performance-chart-years/);
  assert.deepEqual(Array.from(chartData,point=>point.timestamp),[Date.parse(first),Date.parse(last)]);
  for(const value of xAxis.ticks){
   const label=xAxis.tickFormatter(value);assert.match(label,format);assert.doesNotMatch(label,/[\r\n]/);
   const tick=renderToStaticMarkup(React.cloneElement(xAxis.tick,{x:100,y:250,payload:{value}}));
   assert.match(tick,/<text[^>]*y="250"[^>]*dominant-baseline="hanging"/);
   assert.match(tick,/fill="var\(--cf-color-muted\)"/);
   assert.match(tick,/font-size="var\(--cf-text-caption\)"/);
   assert.match(tick,/font-family="var\(--cf-font-ui\)"/);
   assert.doesNotMatch(tick,/<tspan|<br|[\r\n]/);
  }
 }
 const css=readFileSync(new URL('../src/styles/portfolio.css',import.meta.url),'utf8');
 assert.doesNotMatch(css,/performance-chart-years/);
});

test('asset chart finishes with one valid endpoint and a quiet gradient without filling missing values',()=>{
 let dots=[],area,chartData;
 const wrap=({children,data})=>{if(data)chartData=data;return createElement('svg',null,children);};
 const {AssetChart}=loadTypescript('src/features/performance/Charts.tsx',{
  recharts:{ResponsiveContainer:wrap,ComposedChart:wrap,XAxis:()=>null,YAxis:()=>null,
   Area:props=>{area=props;return null;},Tooltip:()=>null,ReferenceArea:()=>null,ReferenceLine:()=>null,
   ReferenceDot:props=>{dots.push(props);return null;}},
 });
 const first={date:'2026-09-16',assetValue:30_100_000};
 for(const data of [
  [first,{date:'2026-09-22',assetValue:30_700_000}],
  [first,{date:'2026-09-22',assetValue:0}],
  [first],
 ]){
  dots=[];
  const before=JSON.stringify(data);
  const html=render(AssetChart,{data,inactivePeriods:[]});
  assert.equal(dots.length,1);
  assert.equal(dots[0].x,Date.parse(data.at(-1).date));assert.equal(dots[0].y,data.at(-1).assetValue);
  assert.equal(dots[0].r,4);assert.equal(dots[0].fill,'var(--cf-color-chart)');
  assert.equal(dots[0].stroke,'var(--cf-color-surface)');assert.equal(dots[0].strokeWidth,2);
  assert.equal(area.dot,false);assert.equal(area.type,'linear');assert.equal(area.strokeWidth,2.15);
  assert.equal(area.connectNulls,false);assert.equal(area.isAnimationActive,false);
  assert.match(html,/offset="0%"[^>]*stop-opacity="0\.18"/);
  assert.match(html,/offset="55%"[^>]*stop-opacity="0\.06"/);
  assert.match(html,/offset="100%"[^>]*stop-opacity="0"/);
  assert.equal(JSON.stringify(data),before);assert.equal(chartData.at(-1).assetValue,data.at(-1).assetValue);
 }
 for(const last of [null,undefined,NaN,Infinity,-Infinity,'30700000']){
  dots=[];
  render(AssetChart,{data:[first,{date:'2026-09-22',assetValue:last}],inactivePeriods:[]});
  assert.deepEqual(dots,[],'A missing final value must not move the endpoint to an earlier day');
 }
 for(const data of [[],[first,{date:'invalid-date',assetValue:30_700_000}],
  [{date:'2026-09-22',assetValue:30_700_000},first]]){
  dots=[];render(AssetChart,{data,inactivePeriods:[]});
  assert.deepEqual(dots,[],'The endpoint must have the actual last valid date');
 }
});

const point=(date,overrides={})=>({date,cutoffAt:`${date}T23:59:59+09:00`,assetValueKRW:100,
 twrIndex:100,netFlowKRW:0,cumulativeNetFlowKRW:100,cumulativeProfitKRW:0,active:true,final:true,...overrides});

// Real component callbacks and range hook; only state storage and external boundaries are replaced.
function performanceHarness(points=[point('2026-09-01'),point('2026-09-14'),point('2026-09-20'),point('2026-09-21')]){
 const state=[];let cursor=0;let tree;let comparisonTree;let dateTree;
 const input={points,transactions:[],displayCurrency:'KRW',currentUsdKrwRate:null,loading:false,error:null,refreshError:null,scopeKey:'account:r1:2026-09-21',results:[],benchmarkStates:{}};
 const observed={retries:[]};
 const {ComparisonList,MAX_COMPARISONS}=loadTypescript('src/features/performance/ComparisonList.tsx');
 const overrides={
  react:{...React,useRef:()=>({current:null}),useMemo:factory=>factory(),useState:initial=>{
   const index=cursor++;
   if(!(index in state))state[index]=typeof initial==='function'?initial():initial;
   return [state[index],value=>{state[index]=typeof value==='function'?value(state[index]):value;}];
  }},
  '@/hooks/usePerformanceHistory':{usePerformanceHistory:()=>input},
  '@/shared/time/use-kst-date':{useKstDate:()=> '2026-09-21'},
  '@/features/performance/IntradayAnalytics':{IntradayAnalytics:props=>{observed.intraday=props;return null;}},
  '@/hooks/usePortfolio':{useTransactions:()=>({transactions:input.transactions}),usePreferences:()=>({displayCurrency:input.displayCurrency}),usePortfolioMarket:()=>({summary:null,currentUsdKrwRate:input.currentUsdKrwRate})},
  '@/features/market/use-stock-search':{useStockSearch:(query,options)=>{
   observed.search={query,...options};return {results:query&&options.enabled?input.results:[],loading:false};
  }},
  '@/features/performance/use-benchmark-series':{useBenchmarkSeries:(symbols,start,end)=>{
   observed.benchmark={symbols:Array.from(symbols),start,end};return {benchmarks:symbols.map(symbol=>({symbol,series:null,loading:false,error:null,...input.benchmarkStates[symbol]})),retry:symbol=>observed.retries.push(symbol)};
  }},
  '@/features/performance/Charts':{AssetChart:props=>{observed.chart={mode:'assets',...props};return null;},ReturnChart:props=>{observed.chart={mode:'return',...props};return null;},PORTFOLIO_LINE:portfolioLine},
  '@/features/performance/ComparisonList':{MAX_COMPARISONS,ComparisonList:props=>{observed.comparisonList=props;comparisonTree=ComparisonList(props);return comparisonTree;}},
 };
 const controls=loadTypescript('src/features/performance/Controls.tsx',overrides);
 overrides['@/features/performance/Controls']={...controls,PerformanceDateControls:props=>{
  dateTree=controls.PerformanceDateControls(props);return dateTree;
 }};
 const {PerformanceAnalytics}=loadTypescript('src/components/PerformanceAnalytics.tsx',overrides);
 const nodes=value=>Array.isArray(value)?value.flatMap(nodes):React.isValidElement(value)?[value,...nodes(value.props.children)]:[];
 const find=predicate=>{const result=nodes([tree,comparisonTree,dateTree]).find(predicate);assert.ok(result,'Expected UI element');return result;};
 return {input,observed,
  draw(){cursor=0;comparisonTree=null;dateTree=null;observed.comparisonList=null;tree=PerformanceAnalytics();return renderToStaticMarkup(tree);},
  element(className){return find(node=>node.props.className===className);},
  button(label){return find(node=>node.type==='button'&&(node.props.children===label||node.props['aria-label']===label));},
  field(label){return find(node=>node.type?.name==='DateField'&&node.props.label===label);},
  changeDate(label,value){this.field(label).props.onChange(value);},
  search(value){find(node=>node.type==='div'&&node.props.className==='performance-search').props.onFocus();find(node=>node.type==='input'&&node.props['aria-label']==='비교할 주식·ETF·지수 검색').props.onChange({target:{value}});},
  selectResult(symbol){const results=find(node=>node.type==='div'&&node.props.className==='performance-search-results');
   const button=nodes(results).find(node=>node.type==='button'&&(!symbol||nodes(node).some(child=>child.type==='small'&&child.props.children===symbol)));
   assert.ok(button,'Expected comparison search result');button.props.onClick();},
 };
}

test('closed securities retain period profit and return while the asset chart is zero and USD history still works',()=>{
 const {buildDailyPerformance}=loadTypescript('src/lib/performance.ts');
 const transactions=[
  {id:'buy',symbol:'A',name:'A',type:'buy',quantity:1,price:1000000,fee:0,currency:'KRW',fxRateToKRW:1,date:'2025-01-01',createdAt:'2025-01-01T00:00:00Z'},
  {id:'sell',symbol:'A',name:'A',type:'sell',quantity:1,price:2000000,fee:0,currency:'KRW',fxRateToKRW:1,date:'2025-01-03',createdAt:'2025-01-03T00:00:00Z'},
 ];
 const points=buildDailyPerformance({transactions,trackingStartDate:'2025-01-01',endDate:'2025-01-05',
  pricesBySymbol:{A:[{date:'2025-01-01',close:1000000},{date:'2025-01-02',close:2000000}]},fxByCurrency:{},strict:true});
 const h=performanceHarness(points);h.input.transactions=transactions;
 h.input.displayCurrency='USD';h.input.currentUsdKrwRate=1000;
 const html=h.draw();
 const summary=html.match(/<dl class="performance-metrics">[\s\S]*?<\/dl>/)?.[0];
 assert.ok(summary);assert.match(summary,/\+₩1,000,000/);assert.doesNotMatch(summary,/%/);
 assert.equal(h.observed.chart.currency,'USD');
 assert.deepEqual(Array.from(h.observed.chart.data,point=>point.assetValue),[1000,2000,0,0,0]);
 h.button('수익률 비교').props.onClick();h.draw();
 assert.deepEqual(Array.from(h.observed.chart.data,point=>Math.round(point.portfolioReturn)),[0,100,100,100,100]);
 h.changeDate('시작일','2025-01-04');const inactive=h.draw();
 assert.match(inactive,/미운용/);assert.match(inactive,/₩0/);
 assert.ok(h.observed.chart.data.every(point=>point.portfolioReturn===null));
});

test('date range decoration stays hidden while both custom calendar inputs remain named',()=>{
 const h=performanceHarness();const html=h.draw();
 const icons=html.match(/<svg\b[^>]*class="[^"]*performance-date-icon[^"]*"[^>]*>/g)||[];
 assert.equal(icons.length,1);assert.match(icons[0],/aria-hidden="true"/);
 assert.match(html,/class="performance-dates" role="group" aria-label="조회 날짜"/);
 assert.equal((html.match(/role="combobox"/g)||[]).length,2);
 for(const label of ['시작일','종료일']){
  const field=h.field(label);const markup=render(field.type,field.props);
  assert.match(markup,new RegExp(`<label[^>]*class="sr-only">${label}</label>`));
  assert.match(markup,/type="text"/);assert.match(markup,/aria-haspopup="dialog"/);assert.match(markup,/performance-date-input/);
 }
});

test('calendar button selects a complete range while direct fields keep single-date callbacks',()=>{
 const h=performanceHarness();h.draw();
 h.button('기간 선택').props.onClick();h.draw();
 assert.equal(h.button('기간 선택').props['aria-expanded'],true);
 assert.equal(h.field('시작일').props.picker.max,'2026-09-21');
 h.field('시작일').props.picker.onSelect('2026-09-14');h.draw();
 assert.equal(h.field('시작일').props.value,'2026-09-01');
 assert.equal(h.field('종료일').props.value,'2026-09-21');
 assert.equal(h.field('시작일').props.picker,undefined);
 assert.equal(h.field('종료일').props.picker.min,'2026-09-14');
 h.field('종료일').props.picker.onSelect('2026-09-20');h.draw();
 assert.equal(h.field('시작일').props.value,'2026-09-14');
 assert.equal(h.field('종료일').props.value,'2026-09-20');
 assert.equal(h.button('기간 선택').props['aria-expanded'],false);
 h.button('기간 선택').props.onClick();h.draw();
 h.field('시작일').props.picker.onSelect('2026-09-21');h.draw();
 assert.equal(h.field('종료일').props.picker.min,'2026-09-21');
 h.field('종료일').props.picker.onDismiss(false);h.draw();
 assert.equal(h.field('시작일').props.value,'2026-09-14');
 assert.equal(h.field('종료일').props.value,'2026-09-20');
 h.changeDate('시작일','2026-09-19');h.draw();
 assert.equal(h.field('시작일').props.value,'2026-09-19');
 assert.equal(h.field('종료일').props.value,'2026-09-20');
 assert.equal(h.field('종료일').props.picker,undefined);
});

test('date field synchronizes external requests before effects without resetting local navigation',()=>{
 const slots=[];let hookIndex=0;let changed=false;let tree;
 const selected=[];const committed=[];const dismissed=[];
 const props={label:'종료일',value:'2026-09-21',min:'2025-01-01',max:'2026-09-21',
  onChange:value=>{committed.push(value);props.value=value;}};
 const {DateField}=loadTypescript('src/features/performance/DateField.tsx',{
  react:{...React,useId:()=> 'date-field-regression',useEffect:()=>{},
   useRef:initial=>{const index=hookIndex++;return slots[index]??=( {current:initial} );},
   useState:initial=>{
    const index=hookIndex++;
    if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;
    return [slots[index],value=>{
     const next=typeof value==='function'?value(slots[index]):value;
     if(!Object.is(next,slots[index])){slots[index]=next;changed=true;}
    }];
   },
  },
 });
 const nodes=value=>Array.isArray(value)?value.flatMap(nodes):React.isValidElement(value)?[value,...nodes(value.props.children)]:[];
 const find=predicate=>{const node=nodes(tree).find(predicate);assert.ok(node,'Expected date field element');return node;};
 const draw=()=>{
  let renders=0;
  do{changed=false;hookIndex=0;tree=DateField(props);assert.ok(++renders<10,'State reset must settle');}while(changed);
 };
 const input=()=>find(node=>node.type==='input');
 const day=date=>find(node=>node.type==='button'&&node.props['data-date']===date);
 const request=value=>{props.picker={value,min:props.min,max:props.max,
  onSelect:date=>selected.push(date),onDismiss:restore=>{dismissed.push(restore);props.picker=undefined;}};draw();};
 draw();input().props.onClick();draw();
 assert.equal(input().props['aria-expanded'],true);
 request('2026-02-15');
 assert.equal(find(node=>node.props.role==='grid').props['aria-label'],'2026년 2월');
 assert.equal(day('2026-02-15').props.tabIndex,0);
 find(node=>node.props['aria-label']==='다음 달').props.onClick();draw();
 props.picker={...props.picker};draw();
 assert.equal(find(node=>node.props.role==='grid').props['aria-label'],'2026년 3월');
 day('2026-03-07').props.onClick();draw();
 assert.deepEqual(selected,['2026-03-07']);assert.deepEqual(committed,[]);
 props.picker=undefined;draw();
 assert.equal(input().props['aria-expanded'],false,'Old single-date popup must not reopen after a range request');
 input().props.onClick();draw();day('2026-09-18').props.onClick();draw();
 assert.deepEqual(committed,['2026-09-18']);assert.equal(input().props['aria-expanded'],false);
 input().props.onKeyDown({key:'ArrowDown',preventDefault(){}});draw();
 day('2026-09-18').props.onKeyDown({key:'ArrowLeft',preventDefault(){}});draw();
 assert.equal(day('2026-09-17').props.tabIndex,0);
 request('2026-02-15');request('2025-03-01');
 assert.equal(day('2025-03-01').props.tabIndex,0);
 tree.props.onKeyDown({key:'Escape',preventDefault(){},stopPropagation(){}});draw();
 assert.deepEqual(dismissed,[true]);assert.equal(input().props['aria-expanded'],false);
 assert.equal(props.value,'2026-09-18');
});

test('period controls apply presets and direct dates immediately while rejecting empty or out of range dates',()=>{
 const h=performanceHarness();const html=h.draw();
 const presetLabels=['1일','5일','1개월','3개월','올해','1년','전체'];
 const rangeGroup=html.match(/<div class="performance-ranges" role="group" aria-label="조회 기간">([\s\S]*?)<\/div>/);
 assert.ok(rangeGroup);assert.deepEqual(Array.from(rangeGroup[1].matchAll(/<button[^>]*>([^<]+)<\/button>/g),match=>match[1]),presetLabels);
 assert.doesNotMatch(html,/>6개월<\/button>/);
 assert.match(html,/class="performance-dates" role="group" aria-label="조회 날짜"/);
 for(const label of ['시작일','종료일'])assert.match(html,new RegExp(`<label[^>]*class="sr-only">${label}</label>`));
 assert.equal((html.match(/class="performance-input performance-date-input"/g)||[]).length,2);
 assert.match(html,/class="performance-date-separator" aria-hidden="true">–<\/span>/);
 const presets=performanceHarness(['2025-09-01','2025-09-21','2026-01-01','2026-06-23','2026-08-22','2026-09-14','2026-09-21'].map(date=>point(date)));
 presets.draw();
 for(const [label,start] of [['1일','2026-09-21'],['5일','2026-09-17'],['1개월','2026-08-23'],['3개월','2026-06-24'],['올해','2026-01-01'],['1년','2025-09-22'],['전체','2025-09-01']]){
  presets.button(label).props.onClick();presets.draw();
  for(const option of presetLabels)assert.equal(presets.button(option).props['aria-pressed'],option===label);
  assert.equal(presets.field('시작일').props.value,start);assert.equal(presets.field('종료일').props.value,'2026-09-21');
  assert.equal(presets.field('시작일').props.min,'2025-09-01');assert.equal(presets.field('시작일').props.max,'2026-09-21');
  assert.equal(presets.field('종료일').props.min,start);assert.equal(presets.field('종료일').props.max,'2026-09-21');
 }
 assert.equal(h.field('시작일').props.value,'2026-09-01');assert.equal(h.field('종료일').props.value,'2026-09-21');
 assert.equal((html.match(/role="combobox"/g)||[]).length,2);
 h.button('5일').props.onClick();h.draw();
 assert.equal(h.button('5일').props['aria-pressed'],true);assert.equal(h.field('시작일').props.value,'2026-09-17');
 h.changeDate('시작일','2026-09-19');h.draw();
 assert.equal(h.field('시작일').props.value,'2026-09-19');assert.equal(h.button('5일').props['aria-pressed'],false);
 assert.deepEqual(Array.from(h.observed.chart.data,p=>p.date),['2026-09-20','2026-09-21']);
 h.changeDate('종료일','2026-09-20');h.draw();
 assert.equal(h.field('종료일').props.value,'2026-09-20');assert.equal(h.observed.benchmark.end,'2026-09-20');
 for(const [label,value] of [['시작일',''],['시작일','2026-08-31'],['시작일','2026-09-21'],['종료일',''],['종료일','2026-09-18'],['종료일','2026-09-22']]){
  h.changeDate(label,value);h.draw();assert.equal(h.field('시작일').props.value,'2026-09-19');assert.equal(h.field('종료일').props.value,'2026-09-20');
 }
 h.button('전체').props.onClick();h.draw();
 assert.equal(h.field('시작일').props.value,'2026-09-01');assert.equal(h.field('종료일').props.value,'2026-09-21');
});

const referenceSeries=()=>({dividendStatus:'confirmed_amount',points:[{date:'2026-08-31',close:100,adjustedClose:90},{date:'2026-09-21',close:105,adjustedClose:100}]});
function addReference(h,symbol,name=`${symbol} fund`){
 h.input.results=[{symbol,name,exchange:'NYSE',type:'ETF'}];
 h.search(symbol);h.draw();h.selectResult(symbol);return h.draw();
}

test('comparison mode keeps common controls separate from the below-chart search and selected references',()=>{
 const h=performanceHarness();h.input.benchmarkStates.VOO={series:referenceSeries()};
 let html=h.draw();
 const controls=()=>renderToStaticMarkup(h.element('performance-controls')).replace(/aria-pressed="(?:true|false)"/g,'');
 const commonControls=controls();
 const period=renderToStaticMarkup(h.element('performance-period'));
 assert.match(period,/aria-label="조회 기간"/);assert.match(period,/aria-label="조회 날짜"/);
 assert.match(period,/aria-label="차트 종류"/);
 assert.equal((html.match(/aria-label="차트 종류"/g)||[]).length,1);
 assert.match(commonControls,/>보유자산 추이<\/button>/);assert.match(commonControls,/>수익률 비교<\/button>/);
 assert.doesNotMatch(commonControls,/<input|performance-search/);
 assert.doesNotMatch(html,/performance-comparison-panel|비교할 주식·ETF·지수 검색/);
 const checkReturnLayout=()=>{
  assert.equal(controls(),commonControls,'Searching or adding a reference must not change the shared control structure');
  const toolbar=renderToStaticMarkup(h.element('performance-toolbar'));
  const panel=renderToStaticMarkup(h.element('performance-comparison-panel'));
  assert.doesNotMatch(toolbar,/performance-search|performance-comparisons|<input/);
  assert.doesNotMatch(toolbar,/aria-label="차트 종류"/);
  assert.match(renderToStaticMarkup(h.element('performance-period')),/aria-label="차트 종류"/);
  assert.match(panel,/aria-label="비교할 주식·ETF·지수 검색"/);
  assert.match(panel,/aria-label="수익률 비교 목록"/);
  assert.ok(html.indexOf('aria-label="수익률 비교 그래프"')<html.indexOf('class="performance-comparison-panel"'),
   'Comparison-only controls belong after the graph, not before it');
 };
 h.button('수익률 비교').props.onClick();html=h.draw();checkReturnLayout();
 h.input.results=[{symbol:'VOO',name:'Vanguard S&P 500 ETF',exchange:'NYSE',type:'ETF'}];
 h.search('VOO');html=h.draw();checkReturnLayout();assert.match(html,/비교 종목 검색 결과/);
 h.selectResult('VOO');html=h.draw();checkReturnLayout();assert.match(html,/VOO 비교 제거/);
 h.button('보유자산 추이').props.onClick();html=h.draw();
 assert.equal(controls(),commonControls);assert.doesNotMatch(html,/performance-comparison-panel|VOO 비교 제거/);
 h.button('수익률 비교').props.onClick();html=h.draw();checkReturnLayout();
 assert.deepEqual(h.observed.benchmark.symbols,['VOO']);
 assert.equal(h.observed.comparisonList.items[0].detail,'','The own-return item must not repeat the KRW chart label');
});

test('compact comparison rows preserve accessible full names and combine names with returns without empty detail rows',()=>{
 const {ComparisonList}=loadTypescript('src/features/performance/ComparisonList.tsx',{
  react:{...React,useId:()=> 'comparison-description'},
 });
 const fullName='Vanguard S&P 500 ETF';
 const tree=ComparisonList({items:[
  {...portfolioLine,value:12.5,detail:''},
  {key:'benchmark_0',name:'VOO',symbol:'VOO',fullName,color:'var(--cf-color-comparison-1)',value:8.25,status:'ready',detail:'배당 포함'},
 ],activeKey:null,onFocus(){},onRemove(){},onRetry(){}});
 const [own,reference]=React.Children.toArray(tree.props.children);
 const ownHtml=renderToStaticMarkup(own);const referenceHtml=renderToStaticMarkup(reference);
 assert.doesNotMatch(ownHtml,/performance-comparison-detail|>KRW</);
 assert.match(ownHtml,/>내 수익률<\/span>[\s\S]*<strong[^>]*>\+12\.50%<\/strong>[\s\S]*<\/button>/);
 assert.match(referenceHtml,/aria-label="VOO 선 강조"/);
 const referenceNodes=React.Children.toArray(reference.props.children);
 const focus=referenceNodes.find(node=>node.props.className==='performance-comparison-focus');
 const description=referenceNodes.find(node=>node.props.id===focus.props['aria-describedby']);
 assert.ok(description,'The full name must be linked to its focus button');
 assert.equal(description.props.hidden,true);assert.equal(description.props.children,fullName);
 assert.doesNotMatch(renderToStaticMarkup(focus),/<small|Vanguard S&amp;P 500 ETF/);
 assert.match(referenceHtml,/>VOO<\/span>[\s\S]*<strong[^>]*>\+8\.25%<\/strong>[\s\S]*<\/button>/);
 assert.match(referenceHtml,/class="performance-comparison-detail">배당 포함<\/span>/);
 assert.match(referenceHtml,/aria-label="VOO 비교 제거"/);
 assert.equal((referenceHtml.match(/<button\b/g)||[]).length,2,'Focusing the line and removing it remain separate actions');
});

test('chart mode and comparison controls preserve selection and scope dividend or error notices to the selected asset',()=>{
 const h=performanceHarness();h.input.benchmarkStates.SPY={series:referenceSeries()};
 h.draw();assert.equal(h.observed.chart.mode,'assets');assert.equal(h.observed.search.enabled,false);
 h.button('수익률 비교').props.onClick();h.draw();assert.equal(h.observed.chart.mode,'return');assert.equal(h.observed.search.enabled,false);
 let html=addReference(h,'SPY','SPDR S&P 500 ETF Trust');
 assert.deepEqual(h.observed.benchmark.symbols,['SPY']);assert.equal(h.observed.chart.comparisons[0].name,'SPY');
 assert.equal(h.observed.search.enabled,true);assert.equal(h.observed.search.query,'');
 assert.match(html,/비교 종목: 현지 통화 · 내 매매 미반영/);assert.match(html,/배당 포함/);assert.match(html,/내 수익률 KRW 기준/);
 assert.equal(h.observed.comparisonList.items[1].status,'ready');
 assert.ok(Math.abs(h.observed.chart.data.at(-1).benchmark_0-(100/90-1)*100)<1e-8);
 h.button('보유자산 추이').props.onClick();html=h.draw();assert.deepEqual(h.observed.benchmark.symbols,[]);assert.doesNotMatch(html,/SPY 비교 제거|수익률 비교 목록|현지 통화/);
 h.button('수익률 비교').props.onClick();h.draw();assert.deepEqual(h.observed.benchmark.symbols,['SPY']);
 h.input.benchmarkStates.SPY.series.dividendStatus='confirmed_zero';assert.match(h.draw(),/가격 기준 · 기간 내 배당 없음/);
 h.input.benchmarkStates.SPY.series.dividendStatus='unavailable';assert.match(h.draw(),/가격 기준 · 배당 자료 없음/);
 h.input.benchmarkStates.SPY.series={dividendStatus:'confirmed_amount',points:[{date:'2026-08-31',close:100},{date:'2026-09-21',close:105}]};
 assert.match(h.draw(),/가격 기준 · 배당 미반영/);assert.ok(Math.abs(h.observed.chart.data.at(-1).benchmark_0-5)<1e-8);
 h.input.benchmarkStates.SPY.loading=true;assert.match(h.draw(),/role="status">불러오는 중/);h.input.benchmarkStates.SPY.loading=false;
 h.input.benchmarkStates.SPY.error='비교 자료 조회 실패';html=h.draw();assert.match(html,/role="alert">조회 실패/);assert.doesNotMatch(html,/배당 미반영/);
 assert.equal(h.observed.comparisonList.items[1].value,null);
 h.button('SPY 비교 제거').props.onClick();html=h.draw();assert.deepEqual(h.observed.benchmark.symbols,[]);assert.equal(h.observed.search.query,'');assert.doesNotMatch(html,/조회 실패|SPY 비교 제거/);
});

test('multiple comparison selections keep stable colors and focus when another reference is removed',()=>{
 const h=performanceHarness();for(const symbol of ['SPY','QQQ','VOO'])h.input.benchmarkStates[symbol]={series:referenceSeries()};
 h.draw();h.button('수익률 비교').props.onClick();h.draw();
 for(const symbol of ['SPY','QQQ','VOO'])addReference(h,symbol);
 assert.deepEqual(h.observed.benchmark.symbols,['SPY','QQQ','VOO']);
 const colors=Object.fromEntries(h.observed.chart.comparisons.map(line=>[line.name,line.color]));
 assert.equal(new Set(Object.values(colors)).size,3);
 h.button('QQQ 선 강조').props.onClick();h.draw();assert.equal(h.observed.chart.activeKey,'benchmark_1');
 assert.equal(h.button('QQQ 선 강조').props['aria-pressed'],true);
 h.button('SPY 비교 제거').props.onClick();h.draw();
 assert.deepEqual(h.observed.benchmark.symbols,['QQQ','VOO']);assert.equal(h.observed.chart.activeKey,'benchmark_0');
 for(const line of h.observed.chart.comparisons)assert.equal(line.color,colors[line.name]);
 h.button('QQQ 선 강조').props.onClick();h.draw();assert.equal(h.observed.chart.activeKey,null);
 h.button('내 수익률 선 강조').props.onClick();h.draw();assert.equal(h.observed.chart.activeKey,'portfolioReturn');
 addReference(h,'SPY');assert.equal(h.observed.chart.activeKey,'portfolioReturn');
 for(const line of h.observed.chart.comparisons)assert.equal(line.color,colors[line.name]);
 h.search('SPY');let html=h.draw();assert.match(html,/이미 비교 중인 종목입니다/);
 assert.deepEqual(h.observed.benchmark.symbols,['QQQ','VOO','SPY']);
 h.button('QQQ 선 강조').props.onClick();h.draw();h.button('QQQ 비교 제거').props.onClick();html=h.draw();
 assert.equal(h.observed.chart.activeKey,null);assert.doesNotMatch(html,/QQQ 비교 제거/);
 assert.doesNotMatch(html,/<details|<summary|펼치|접기/);
});

test('partial comparison failures keep the portfolio and successful series with per-symbol retry and loading states',()=>{
 const h=performanceHarness();h.input.benchmarkStates={SPY:{series:referenceSeries()},QQQ:{error:'비교 조회 실패'},VOO:{loading:true}};
 h.draw();h.button('수익률 비교').props.onClick();h.draw();
 const ownReturn=h.observed.chart.data.at(-1).portfolioReturn;
 for(const symbol of ['SPY','QQQ','VOO'])addReference(h,symbol);
 let html=h.draw();
 assert.equal(h.observed.chart.data.at(-1).portfolioReturn,ownReturn);
 assert.ok(Number.isFinite(h.observed.chart.data.at(-1).benchmark_0));
 assert.ok(h.observed.chart.data.every(point=>point.benchmark_1===null&&point.benchmark_2===null));
 assert.deepEqual(Array.from(h.observed.comparisonList.items.slice(1),item=>item.status),['ready','error','loading']);
 assert.match(html,/role="alert">조회 실패/);assert.match(html,/role="status">불러오는 중/);
 assert.match(html,/수익률 비교 그래프/);assert.doesNotMatch(html,/성과 조회 실패/);
 h.button('QQQ 다시 조회').props.onClick();assert.deepEqual(h.observed.retries,['QQQ']);
 h.input.benchmarkStates.QQQ={series:referenceSeries()};html=h.draw();
 assert.ok(Number.isFinite(h.observed.chart.data.at(-1).benchmark_1));assert.doesNotMatch(html,/QQQ 다시 조회|조회 실패/);
 assert.match(html,/role="status">불러오는 중/);
});

test('unavailable comparison focus pauses during period reload and restores only after valid data returns',()=>{
 const h=performanceHarness();for(const symbol of ['SPY','QQQ'])h.input.benchmarkStates[symbol]={series:referenceSeries()};
 h.draw();h.button('수익률 비교').props.onClick();h.draw();
 addReference(h,'SPY');addReference(h,'QQQ');h.button('SPY 선 강조').props.onClick();h.draw();
 assert.equal(h.observed.chart.activeKey,'benchmark_0');assert.equal(h.button('SPY 선 강조').props.disabled,false);
 h.changeDate('시작일','2026-09-14');h.input.benchmarkStates.SPY={loading:true};h.draw();
 assert.equal(h.observed.benchmark.start,'2026-09-14');assert.equal(h.observed.chart.activeKey,null);
 assert.equal(h.button('SPY 선 강조').props.disabled,true);assert.equal(h.button('SPY 선 강조').props['aria-pressed'],false);
 assert.equal(h.button('QQQ 선 강조').props.disabled,false);assert.notEqual(h.button('SPY 비교 제거').props.disabled,true);
 assert.ok(Number.isFinite(h.observed.chart.data.at(-1).benchmark_1));
 h.input.benchmarkStates.SPY={error:'비교 조회 실패'};h.draw();
 assert.equal(h.observed.chart.activeKey,null);assert.equal(h.button('SPY 선 강조').props.disabled,true);
 assert.notEqual(h.button('SPY 다시 조회').props.disabled,true);h.button('SPY 다시 조회').props.onClick();
 assert.deepEqual(h.observed.retries,['SPY']);
 h.input.benchmarkStates.SPY={series:{dividendStatus:'unavailable',points:[{date:'2026-09-21',close:10}]}};h.draw();
 assert.equal(h.observed.comparisonList.items[1].status,'missing-start');
 assert.equal(h.observed.chart.activeKey,null);assert.equal(h.button('SPY 선 강조').props.disabled,true);
 h.input.benchmarkStates.SPY={series:referenceSeries()};h.draw();
 assert.equal(h.observed.chart.activeKey,'benchmark_0');assert.equal(h.button('SPY 선 강조').props['aria-pressed'],true);
 assert.equal(h.button('SPY 선 강조').props.disabled,false);
 h.input.benchmarkStates.SPY={error:'비교 조회 실패'};h.draw();h.button('SPY 비교 제거').props.onClick();h.draw();
 assert.deepEqual(h.observed.benchmark.symbols,['QQQ']);assert.equal(h.observed.chart.activeKey,null);
});

test('comparison history missing the selected start stays unavailable rather than drawing a fictional zero',()=>{
 const h=performanceHarness();h.input.benchmarkStates.IPO={series:{dividendStatus:'unavailable',points:[{date:'2026-09-14',close:10},{date:'2026-09-21',close:15}]}};
 h.draw();h.button('수익률 비교').props.onClick();h.draw();const html=addReference(h,'IPO');
 assert.equal(h.observed.comparisonList.items[1].status,'missing-start');assert.equal(h.observed.comparisonList.items[1].value,null);
 assert.ok(h.observed.chart.data.every(point=>point.benchmark_0===null));
 assert.match(html,/시작일 시세 없음 · 기간을 줄여 주세요/);assert.doesNotMatch(html,/IPO 다시 조회/);
 h.changeDate('시작일','2026-09-15');h.draw();
 assert.equal(h.observed.comparisonList.items[1].status,'ready');assert.equal(h.observed.chart.data.at(-1).benchmark_0,50);
});

test('comparison selection limit leaves twelve real references and reopens search after removal',()=>{
 const h=performanceHarness();h.draw();h.button('수익률 비교').props.onClick();h.draw();
 for(let index=0;index<12;index++){
  const symbol=`REF${index}`;h.input.benchmarkStates[symbol]={series:referenceSeries()};addReference(h,symbol);
 }
 const html=h.draw();assert.equal(h.observed.chart.comparisons.length,12);assert.equal(h.observed.comparisonList.items.length,13);
 assert.equal(new Set(h.observed.chart.comparisons.map(line=>line.color)).size,12);
 assert.equal(h.observed.search.enabled,false);assert.match(html,/disabled="" placeholder="최대 12개 비교 중"/);
 h.button('REF3 비교 제거').props.onClick();h.draw();assert.equal(h.observed.search.enabled,true);
 h.input.benchmarkStates.NEXT={series:referenceSeries()};addReference(h,'NEXT');
 assert.equal(h.observed.chart.comparisons.length,12);assert.equal(h.observed.search.enabled,false);
});

test('holdings and return modes retain period sale profit without inventing a cash balance',()=>{
 const h=performanceHarness([
  point('2026-09-01'),
  point('2026-09-11',{assetValueKRW:0,active:false,netFlowKRW:-120}),
  point('2026-09-21',{assetValueKRW:0,active:false}),
 ]);
 h.input.transactions=[{id:'sell-all',date:'2026-09-11',type:'sell',symbol:'TEST',name:'Test',quantity:1,price:120,fee:0,currency:'KRW',fxRateToKRW:1,createdAt:'2026-09-11T00:00:00Z'}];
 for(const label of ['보유자산 추이','수익률 비교','보유자산 추이']){
  h.draw();h.button(label).props.onClick();const html=h.draw();
  assert.match(html,/\+₩20/);
  assert.doesNotMatch(html,/미운용|누적 순투입금|순입금|현금 잔액/);
  assert.equal(h.observed.chart.data.at(-1).assetValueKRW,0);
  assert.equal((html.match(/<dt>/g)||[]).length,1);
  assert.match(html,new RegExp(`aria-label="${label} 그래프"`));
  if(label==='보유자산 추이')assert.equal(h.observed.chart.data.at(-1).assetValue,0);
 }
});

test('period empty, failed and initial loading states do not render fictional zero metrics',()=>{
 const h=performanceHarness([]);let html=h.draw();
 assert.match(html,/성과 기록 없음/);assert.doesNotMatch(html,/<dt>|성과 조회 실패/);
 h.input.error=h.input.refreshError='격리된 성과 조회 오류';html=h.draw();
 assert.match(html,/성과 조회 실패/);assert.equal(html.split(h.input.error).length-1,1);assert.match(html,/role="alert"/);assert.doesNotMatch(html,/<dt>|성과 기록 없음/);
 h.input.error=null;h.input.refreshError=null;h.input.loading=true;html=h.draw();
 assert.match(html,/aria-busy="true"/);assert.match(html,/role="status"/);assert.match(html,/성과 불러오는 중/);assert.doesNotMatch(html,/<dt>|₩0|0\.00%|성과 기록 없음/);
 assert.equal(h.button('전체').props.disabled,true);
 h.input.points=[point('2026-09-20')];h.input.loading=false;h.input.error='이전 값 이후 갱신 실패';html=h.draw();
 assert.match(html,/<dt>기간 손익<span/);assert.equal(html.split(h.input.error).length-1,1);assert.match(html,/role="alert"/);
});

test('failed refresh keeps only the last complete view and clearly distinguishes it from a saving warning',()=>{
 const h=performanceHarness();h.draw();
 const complete=JSON.stringify(h.observed.chart.data);
 h.input.error=h.input.refreshError='시장 데이터 조회 실패';
 let html=h.draw();
 assert.match(html,/갱신하지 못해 이전 결과를 표시합니다\./);
 assert.match(html,/aria-label="보유자산 추이 그래프"/);
 assert.equal(JSON.stringify(h.observed.chart.data),complete);
 assert.doesNotMatch(html,/시장 데이터 조회 실패|성과 조회 실패/);
 h.input.loading=true;html=h.draw();
 assert.match(html,/갱신하지 못해 이전 결과를 표시합니다\./);
 assert.match(html,/aria-label="보유자산 추이 그래프"/);
 h.input.loading=false;h.input.error=null;h.input.refreshError=null;
 h.input.points=h.input.points.map(point=>({...point,assetValueKRW:140}));
 html=h.draw();assert.doesNotMatch(html,/갱신하지 못해/);
 assert.equal(h.observed.chart.data.at(-1).assetValue,140);
 h.input.error='성과 저장 실패';html=h.draw();
 assert.match(html,/성과 저장 실패/);assert.doesNotMatch(html,/갱신하지 못해/);
 assert.match(html,/aria-label="보유자산 추이 그래프"/);
});

test('failed refresh never substitutes another selected period or account ledger day with the retained graph',()=>{
 const h=performanceHarness();h.draw();
 h.input.error=h.input.refreshError='새 자료 조회 실패';
 h.draw();h.changeDate('시작일','2026-09-15');let html=h.draw();
 assert.match(html,/성과 조회 실패/);assert.doesNotMatch(html,/<dt>|aria-label="보유자산 추이 그래프"|갱신하지 못해/);
 h.input.loading=true;html=h.draw();
 assert.match(html,/성과 불러오는 중/);assert.doesNotMatch(html,/<dt>|aria-label="보유자산 추이 그래프"/);
 h.button('전체').props.onClick();html=h.draw();
 assert.match(html,/갱신하지 못해 이전 결과를 표시합니다\./);
 h.input.loading=false;
 for(const scope of ['other-account:r1:2026-09-21','account:r2:2026-09-21','account:r1:2026-09-22']){
  h.input.scopeKey=scope;html=h.draw();
  assert.doesNotMatch(html,/<dt>|aria-label="보유자산 추이 그래프"|갱신하지 못해/);
 }
 h.input.error=null;h.input.refreshError=null;html=h.draw();
 assert.match(html,/aria-label="보유자산 추이 그래프"/);
});

test('period money remains separate from comparison return and keeps inactive meaning',()=>{
 const {PerformanceSummary}=loadTypescript('src/features/performance/Controls.tsx');
 for(const [value,tone] of [[100,'up'],[-100,'down'],[0,'ink'],[NaN,'ink']]){
  const html=render(PerformanceSummary,{profitKRW:value});
  assert.match(html,new RegExp(`class="performance-metric-amount text-cf-${tone==='ink'?'ink':`market-${tone}`}"`));
  assert.doesNotMatch(html,/NaN|%|performance-metric-return/);
  if(Number.isNaN(value))assert.match(html,/계산 불가/);
 }
 const h=performanceHarness([point('2026-09-20',{assetValueKRW:0,openingValueKRW:0,active:false}),point('2026-09-21',{assetValueKRW:0,openingValueKRW:0,active:false})]);
 const html=h.draw();assert.match(html,/performance-metric-return text-cf-muted">미운용/);
 assert.doesNotMatch(html,/0\.00%|운용 수익률|내 자금 수익률|수익률 계산 불가/);
 assert.match(html,/미보유 기간/);assert.doesNotMatch(html,/회색 구간:|수익률 고정/);
});

test('period money and daily-linked return stay in their respective places across purchases and inclusive date changes',()=>{
 const h=performanceHarness([
  point('2026-09-01',{openingValueKRW:0,netFlowKRW:100}),
  point('2026-09-02',{openingValueKRW:100,assetValueKRW:1020,netFlowKRW:900}),
  point('2026-09-03',{openingValueKRW:1020,assetValueKRW:918}),
 ]);
 const trade={type:'buy',symbol:'TEST',name:'Test',price:100,fee:0,currency:'KRW',fxRateToKRW:1};
 h.input.transactions=[
  {...trade,id:'initial',date:'2026-09-01',quantity:1,createdAt:'2026-09-01T00:00:00Z'},
  {...trade,id:'added',date:'2026-09-02',quantity:9,createdAt:'2026-09-02T00:00:00Z'},
 ];
 let html=h.draw();assert.match(html,/-₩82/);assert.doesNotMatch(html,/%/);
 h.button('수익률 비교').props.onClick();html=h.draw();
 assert.ok(Math.abs(h.observed.chart.data.at(-1).portfolioReturn+8.2)<1e-8);
 assert.match(html,/-8\.20%/);assert.match(html,/>내 수익률<\/span>/);
 h.changeDate('시작일','2026-09-03');html=h.draw();
 assert.match(html,/-₩102/);assert.match(html,/-10\.00%/);
 assert.ok(Math.abs(h.observed.chart.data.at(-1).portfolioReturn+10)<1e-8);
 h.input.points=[point('2026-09-01',{openingValueKRW:0,assetValueKRW:0,active:false}),point('2026-09-21',{openingValueKRW:0,assetValueKRW:100,active:true})];
 h.input.transactions=[{...trade,id:'late',date:'2026-09-21',quantity:1,createdAt:'2026-09-21T00:00:00Z'}];
 h.button('전체').props.onClick();html=h.draw();
 assert.doesNotMatch(html,/수익률 계산 불가/);assert.match(html,/0\.00%/);
 assert.equal(h.observed.chart.data.at(-1).portfolioReturn,0);
});

test('closed intraday trades include the selected first day and zero-profit round trips have zero return',()=>{
 const h=performanceHarness(['2026-09-01','2026-09-11','2026-09-21'].map(date=>point(date,{openingValueKRW:0,assetValueKRW:0,active:false})));
 const trade={date:'2026-09-01',symbol:'TEST',name:'Test',quantity:1,fee:0,currency:'KRW',fxRateToKRW:1,createdAt:'2026-09-01T00:00:00Z'};
 h.input.transactions=[{...trade,id:'buy',type:'buy',price:100},{...trade,id:'sell',type:'sell',price:90}];
 let html=h.draw();assert.match(html,/-₩10/);assert.doesNotMatch(html,/미운용/);
 h.button('수익률 비교').props.onClick();html=h.draw();
 assert.ok(Math.abs(h.observed.chart.data.at(-1).portfolioReturn+10)<1e-8);
 assert.match(html,/-10\.00%/);
 h.input.transactions[1].price=100;html=h.draw();
 assert.doesNotMatch(html,/미운용|수익률 계산 불가/);assert.match(html,/0\.00%/);
 assert.equal(h.observed.chart.data.at(-1).portfolioReturn,0);
});
