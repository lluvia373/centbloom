import test from 'node:test';
import assert from 'node:assert/strict';
import React, {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTypescript} from './load-typescript.mjs';
const render=(component,props={})=>renderToStaticMarkup(createElement(component,props));

test('period performance removes provider explanations while retaining reference FX metadata',()=>{
 let points=[{date:'2026-09-20',cutoffAt:'2026-09-20T23:59:59+09:00',assetValueKRW:100,
  twrIndex:100,netFlowKRW:0,cumulativeNetFlowKRW:0,cumulativeProfitKRW:0,active:true,final:true,
  fxReferences:{CNY:'2026-09-18'}}];
 let data;
 const {PerformanceAnalytics}=loadTypescript('src/components/PerformanceAnalytics.tsx',{
  '@/hooks/usePerformanceHistory':{usePerformanceHistory:()=>({points,trackingStartedAt:'2026-09-20T00:00:00Z',loading:false,error:null})},
  '@/hooks/usePortfolio':{useTransactions:()=>({transactions:[]}),usePreferences:()=>({displayCurrency:'KRW'}),usePortfolioMarket:()=>({summary:null})},
  '@/features/market/use-stock-search':{useStockSearch:()=>({results:[],loading:false})},
  '@/features/performance/use-benchmark-series':{useBenchmarkSeries:()=>({benchmarkSeries:null,benchmarkLoading:false,benchmarkError:null})},
  '@/features/performance/Charts':{AssetChart:props=>{data=props.data;return null;},ReturnChart:()=>null},
 });
 const html=render(PerformanceAnalytics);
 assert.doesNotMatch(html,/ECB|일별 기준환율 적용|일별 성과|보유분 평가손익|Modified Dietz|<details|<summary|23:59:59|추정|직접 선택/);
 assert.match(html,/<h2[^>]*>기간 성과<\/h2>/);
 assert.match(html,/<dt>기간 손익<span/);assert.match(html,/기간 수익률/);
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
  recharts:{ResponsiveContainer:wrap,ComposedChart:wrap,LineChart:wrap,CartesianGrid:()=>null,XAxis:()=>null,YAxis:()=>null,ReferenceArea:()=>null,Area:props=>{plottedKeys.push(props.dataKey);return null;},Line:props=>{plottedKeys.push(props.dataKey);return null;},Tooltip:props=>{tooltip=props;return null;}},
 });
 const data=[{date:'2026-09-20',fxReferences:{USD:'2026-09-18',CNY:'2026-09-17'}}];
 for(const chart of [AssetChart,ReturnChart]){
  plottedKeys=[];
  render(chart,{data,inactivePeriods:[],currency:'USD',benchmarkName:'SPY'});
  assert.equal(tooltip.labelFormatter('2026-09-20',[{payload:data[0]}]),'2026.09.20');
  assert.equal(chartData,data);assert.equal(chartData[0].fxReferences.CNY,'2026-09-17');
  if(chart===AssetChart){assert.match(tooltip.formatter(100,'assetValue')[0],/\$100\.00$/);assert.equal(tooltip.formatter(100,'assetValue')[1],'보유자산');assert.deepEqual(plottedKeys,['assetValue']);}
  else{assert.equal(tooltip.formatter(5,'portfolioReturn')[1],'내 수익률');assert.equal(tooltip.formatter(5,'benchmarkReturn')[1],'SPY 참고 수익률');assert.match(tooltip.formatter(5,'portfolioReturn')[0],/5\.00%/);}
 }
});

const point=(date,overrides={})=>({date,cutoffAt:`${date}T23:59:59+09:00`,assetValueKRW:100,
 twrIndex:100,netFlowKRW:0,cumulativeNetFlowKRW:100,cumulativeProfitKRW:0,active:true,final:true,...overrides});

// Real component callbacks and range hook; only state storage and external boundaries are replaced.
function performanceHarness(points=[point('2026-09-01'),point('2026-09-14'),point('2026-09-20'),point('2026-09-21')]){
 const state=[];let cursor=0;let tree;
 const input={points,transactions:[],loading:false,error:null,results:[],series:null,benchmarkLoading:false,benchmarkError:null};
 const observed={};
 const {PerformanceAnalytics}=loadTypescript('src/components/PerformanceAnalytics.tsx',{
  react:{...React,useRef:()=>({current:null}),useMemo:factory=>factory(),useState:initial=>{
   const index=cursor++;
   if(!(index in state))state[index]=typeof initial==='function'?initial():initial;
   return [state[index],value=>{state[index]=typeof value==='function'?value(state[index]):value;}];
  }},
  '@/hooks/usePerformanceHistory':{usePerformanceHistory:()=>input},
  '@/hooks/usePortfolio':{useTransactions:()=>({transactions:input.transactions}),usePreferences:()=>({displayCurrency:'KRW'}),usePortfolioMarket:()=>({summary:null})},
  '@/features/market/use-stock-search':{useStockSearch:(query,options)=>{
   observed.search={query,...options};return {results:query&&options.enabled?input.results:[],loading:false};
  }},
  '@/features/performance/use-benchmark-series':{useBenchmarkSeries:(symbol,start,end)=>{
   observed.benchmark={symbol,start,end};return {benchmarkSeries:symbol?input.series:null,benchmarkLoading:!!symbol&&input.benchmarkLoading,benchmarkError:symbol?input.benchmarkError:null};
  }},
  '@/features/performance/Charts':{AssetChart:props=>{observed.chart={mode:'assets',...props};return null;},ReturnChart:props=>{observed.chart={mode:'return',...props};return null;}},
 });
 const nodes=value=>Array.isArray(value)?value.flatMap(nodes):React.isValidElement(value)?[value,...nodes(value.props.children)]:[];
 const find=predicate=>{const result=nodes(tree).find(predicate);assert.ok(result,'Expected UI element');return result;};
 return {input,observed,
  draw(){cursor=0;tree=PerformanceAnalytics();return renderToStaticMarkup(tree);},
  button(label){return find(node=>node.type==='button'&&(node.props.children===label||node.props['aria-label']===label));},
  field(label){return find(node=>node.type?.name==='DateField'&&node.props.label===label);},
  changeDate(label,value){this.field(label).props.onChange(value);},
  search(value){find(node=>node.type==='input'&&node.props['aria-label']==='비교할 주식·ETF·지수 검색').props.onChange({target:{value}});},
  selectResult(){find(node=>node.type==='div'&&node.props.className==='performance-search-results').props.children[0].props.onClick();},
 };
}

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
 const presetLabels=['1주','1개월','3개월','올해','1년','전체'];
 const rangeGroup=html.match(/<div class="performance-ranges" role="group" aria-label="조회 기간">([\s\S]*?)<\/div>/);
 assert.ok(rangeGroup);assert.deepEqual(Array.from(rangeGroup[1].matchAll(/<button[^>]*>([^<]+)<\/button>/g),match=>match[1]),presetLabels);
 assert.doesNotMatch(html,/>1일<\/button>|>6개월<\/button>/);
 assert.match(html,/class="performance-dates" role="group" aria-label="조회 날짜"/);
 for(const label of ['시작일','종료일'])assert.match(html,new RegExp(`<label[^>]*class="sr-only">${label}</label>`));
 assert.equal((html.match(/class="performance-input performance-date-input"/g)||[]).length,2);
 assert.match(html,/class="performance-date-separator" aria-hidden="true">–<\/span>/);
 const presets=performanceHarness(['2025-09-01','2025-09-21','2026-01-01','2026-06-23','2026-08-22','2026-09-14','2026-09-21'].map(date=>point(date)));
 presets.draw();
 for(const [label,start] of [['1주','2026-09-14'],['1개월','2026-08-22'],['3개월','2026-06-23'],['올해','2026-01-01'],['1년','2025-09-21'],['전체','2025-09-01']]){
  presets.button(label).props.onClick();presets.draw();
  for(const option of presetLabels)assert.equal(presets.button(option).props['aria-pressed'],option===label);
  assert.equal(presets.field('시작일').props.value,start);assert.equal(presets.field('종료일').props.value,'2026-09-21');
  assert.equal(presets.field('시작일').props.min,'2025-09-01');assert.equal(presets.field('시작일').props.max,'2026-09-21');
  assert.equal(presets.field('종료일').props.min,start);assert.equal(presets.field('종료일').props.max,'2026-09-21');
 }
 assert.equal(h.field('시작일').props.value,'2026-09-01');assert.equal(h.field('종료일').props.value,'2026-09-21');
 assert.equal((html.match(/role="combobox"/g)||[]).length,2);
 h.button('1주').props.onClick();h.draw();
 assert.equal(h.button('1주').props['aria-pressed'],true);assert.equal(h.field('시작일').props.value,'2026-09-14');
 h.changeDate('시작일','2026-09-19');h.draw();
 assert.equal(h.field('시작일').props.value,'2026-09-19');assert.equal(h.button('1주').props['aria-pressed'],false);
 assert.deepEqual(Array.from(h.observed.chart.data,p=>p.date),['2026-09-20','2026-09-21']);
 h.changeDate('종료일','2026-09-20');h.draw();
 assert.equal(h.field('종료일').props.value,'2026-09-20');assert.equal(h.observed.benchmark.end,'2026-09-20');
 for(const [label,value] of [['시작일',''],['시작일','2026-08-31'],['시작일','2026-09-21'],['종료일',''],['종료일','2026-09-18'],['종료일','2026-09-22']]){
  h.changeDate(label,value);h.draw();assert.equal(h.field('시작일').props.value,'2026-09-19');assert.equal(h.field('종료일').props.value,'2026-09-20');
 }
 h.button('전체').props.onClick();h.draw();
 assert.equal(h.field('시작일').props.value,'2026-09-01');assert.equal(h.field('종료일').props.value,'2026-09-21');
});

test('chart mode and comparison controls preserve selection and scope dividend or error notices to the selected asset',()=>{
 const h=performanceHarness();h.input.results=[{symbol:'SPY',name:'SPDR S&P 500 ETF Trust',exchange:'NYSE',type:'ETF'}];
 h.input.series={dividendStatus:'confirmed_amount',points:[{date:'2026-09-01',close:100,adjustedClose:90},{date:'2026-09-21',close:105,adjustedClose:100}]};
 h.draw();assert.equal(h.observed.chart.mode,'assets');assert.equal(h.observed.search.enabled,false);
 h.button('수익률 비교').props.onClick();h.draw();assert.equal(h.observed.chart.mode,'return');assert.equal(h.observed.search.enabled,true);
 h.search('SPY');h.draw();h.selectResult();let html=h.draw();
 assert.equal(h.observed.benchmark.symbol,'SPY');assert.equal(h.observed.chart.benchmarkName,'SPY');assert.equal(h.observed.search.enabled,false);
 assert.match(html,/SPY · 현지 통화 · 배당 포함 · 내 매매 미반영/);assert.match(html,/SPY 참고 수익률/);assert.match(html,/내 수익률 KRW 기준/);
 assert.ok(Math.abs(h.observed.chart.data.at(-1).benchmarkReturn-(100/90-1)*100)<1e-8);
 h.button('보유자산 추이').props.onClick();html=h.draw();assert.equal(h.observed.benchmark.symbol,undefined);assert.doesNotMatch(html,/SPY · 현지 통화|비교 자산 제거|SPY 참고 수익률/);
 h.button('수익률 비교').props.onClick();h.draw();assert.equal(h.observed.benchmark.symbol,'SPY');
 h.input.series.dividendStatus='confirmed_zero';assert.match(h.draw(),/SPY · 현지 통화 · 가격 기준 · 기간 내 배당 없음/);
 h.input.series.dividendStatus='unavailable';assert.match(h.draw(),/SPY · 현지 통화 · 가격 기준 · 배당 자료 없음/);
 h.input.series={dividendStatus:'confirmed_amount',points:[{date:'2026-09-01',close:100},{date:'2026-09-21',close:105}]};
 assert.match(h.draw(),/가격 기준 · 배당 미반영/);assert.ok(Math.abs(h.observed.chart.data.at(-1).benchmarkReturn-5)<1e-8);
 h.input.benchmarkLoading=true;assert.match(h.draw(),/비교 자료 불러오는 중/);h.input.benchmarkLoading=false;
 h.input.benchmarkError='비교 자료 조회 실패';html=h.draw();assert.match(html,/role="alert"[^>]*>비교 자료 조회 실패/);assert.doesNotMatch(html,/SPY · 현지 통화/);
 h.button('비교 자산 제거').props.onClick();html=h.draw();assert.equal(h.observed.benchmark.symbol,undefined);assert.equal(h.observed.search.query,'');assert.doesNotMatch(html,/비교 자료 조회 실패|비교 자산 제거/);
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
 h.input.error='격리된 성과 조회 오류';html=h.draw();
 assert.match(html,/성과 조회 실패/);assert.equal(html.split(h.input.error).length-1,1);assert.match(html,/role="alert"/);assert.doesNotMatch(html,/<dt>|성과 기록 없음/);
 h.input.error=null;h.input.loading=true;html=h.draw();
 assert.match(html,/aria-busy="true"/);assert.match(html,/role="status"/);assert.match(html,/성과 불러오는 중/);assert.doesNotMatch(html,/<dt>|₩0|0\.00%|성과 기록 없음/);
 assert.equal(h.button('전체').props.disabled,true);
 h.input.points=[point('2026-09-20')];h.input.loading=false;h.input.error='이전 값 이후 갱신 실패';html=h.draw();
 assert.match(html,/<dt>기간 손익<span/);assert.equal(html.split(h.input.error).length-1,1);assert.match(html,/role="alert"/);
});

test('period metric colors distinguish gains, losses, zero and unavailable values without changing inactive meaning',()=>{
 const {PerformanceSummary}=loadTypescript('src/features/performance/Controls.tsx');
 for(const [value,tone] of [[100,'up'],[-100,'down'],[0,'ink'],[NaN,'ink']]){
  const html=render(PerformanceSummary,{profitKRW:value,returnPercent:value});
  assert.match(html,new RegExp(`class="performance-metric-amount text-cf-${tone==='ink'?'ink':`market-${tone}`}"`));
  if(Number.isNaN(value)){assert.match(html,/수익률 계산 불가/);assert.doesNotMatch(html,/NaN|0\.00%/);}
  else assert.match(html,new RegExp(`class="performance-metric-return text-cf-${tone==='ink'?'ink':`market-${tone}`}"`));
 }
 const unavailable=render(PerformanceSummary,{profitKRW:-82,returnPercent:null});
 assert.match(unavailable,/-₩82/);assert.match(unavailable,/수익률 계산 불가/);assert.doesNotMatch(unavailable,/0\.00%/);
 const h=performanceHarness([point('2026-09-20',{assetValueKRW:0,active:false}),point('2026-09-21',{assetValueKRW:0,active:false})]);
 const html=h.draw();assert.match(html,/performance-metric-return text-cf-muted">미운용/);
 assert.doesNotMatch(html,/0\.00%|운용 수익률|내 자금 수익률|수익률 계산 불가/);
 assert.match(html,/미보유 기간/);assert.doesNotMatch(html,/회색 구간:|수익률 고정/);
});

test('period summary and own return chart use the same money-weighted return after added capital and date changes',()=>{
 const h=performanceHarness([
  point('2026-09-01'),
  point('2026-09-11',{assetValueKRW:1020,twrIndex:120,netFlowKRW:900}),
  point('2026-09-21',{assetValueKRW:918,twrIndex:108}),
 ]);
 h.input.transactions=[{id:'added-capital',date:'2026-09-11',type:'buy',symbol:'TEST',name:'Test',quantity:9,price:100,fee:0,currency:'KRW',fxRateToKRW:1,createdAt:'2026-09-11T00:00:00Z'}];
 let html=h.draw();assert.match(html,/-₩82/);assert.match(html,/-14\.91%/);assert.doesNotMatch(html,/\+8\.00%/);
 h.button('수익률 비교').props.onClick();html=h.draw();
 assert.ok(Math.abs(h.observed.chart.data.at(-1).portfolioReturn-(-82/550*100))<1e-8);
 assert.match(html,/-14\.91%/);assert.match(html,/>내 수익률<\/span>/);
 h.changeDate('시작일','2026-09-11');html=h.draw();
 assert.match(html,/-₩102/);assert.match(html,/-10\.00%/);
 assert.equal(h.observed.chart.data.at(-1).portfolioReturn,-10);
 h.input.points=[point('2026-09-01',{assetValueKRW:0,active:false}),point('2026-09-21',{assetValueKRW:100,active:true})];
 h.input.transactions=[{...h.input.transactions[0],date:'2026-09-21',quantity:1}];
 h.button('전체').props.onClick();html=h.draw();
 assert.match(html,/수익률 계산 불가/);assert.doesNotMatch(html,/0\.00%/);
 assert.equal(h.observed.chart.data.at(-1).portfolioReturn,null);
});

test('closed intraday trades are not called inactive just because all closing holdings are empty',()=>{
 const h=performanceHarness(['2026-09-01','2026-09-11','2026-09-21'].map(date=>point(date,{assetValueKRW:0,active:false})));
 const trade={date:'2026-09-11',symbol:'TEST',name:'Test',quantity:1,fee:0,currency:'KRW',fxRateToKRW:1,createdAt:'2026-09-11T00:00:00Z'};
 h.input.transactions=[{...trade,id:'buy',type:'buy',price:100},{...trade,id:'sell',type:'sell',price:90}];
 let html=h.draw();assert.match(html,/-₩10/);assert.doesNotMatch(html,/미운용/);
 h.button('수익률 비교').props.onClick();html=h.draw();
 const rate=h.observed.chart.data.at(-1).portfolioReturn;
 assert.ok(Number.isFinite(rate));assert.match(html,new RegExp(rate.toFixed(2).replace('.','\\.')+'%'));
 h.input.transactions[1].price=100;html=h.draw();
 assert.doesNotMatch(html,/미운용/);assert.match(html,/수익률 계산 불가/);
 assert.equal(h.observed.chart.data.at(-1).portfolioReturn,null);
});
