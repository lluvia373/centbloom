import test from 'node:test';import assert from 'node:assert/strict';
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {loadTypescript} from './load-typescript.mjs';
const css={default:new Proxy({},{get:(_,key)=>String(key)})};
const {guruCatalog}=loadTypescript('src/features/gurus/catalog.ts');
const catalog=guruCatalog.map(guru=>({...guru,sourceState:{checkedAt:null,issue:null}}));
const {summarizeGuru}=loadTypescript('src/features/gurus/list-model.ts');
const detailReader=records=>async(slug,accession)=>{
 const guru=records.find(row=>row.slug===slug);if(!guru)return null;
 const filing=guru.archive.versions.find(row=>row.accession===(accession??guru.archive.activeAccession));if(!filing)return null;
 const versions=[...guru.archive.versions].sort((a,b)=>b.period.localeCompare(a.period)||b.revision-a.revision);
 return {guru,filing,versions,previous:versions.find(row=>row.period<filing.period)};
};
const common={'next/link':{default:({children,prefetch:_,...props})=>React.createElement('a',props,children)},'@/features/gurus/Guru.module.css':css,'./Guru.module.css':css,
 '@/features/gurus/directory-repository':{getPreparedDirectory:()=>({summaries:catalog.map(guru=>summarizeGuru(guru,guru.archive.versions.find(filing=>filing.accession===guru.archive.activeAccession))),pending:[]})},
 '@/features/gurus/detail-repository':{getGuruDetail:detailReader(catalog)},
 'next/navigation':{notFound:()=>{throw Error('not-found')},useRouter:()=>({push(){},replace(){}}),usePathname:()=>'/gurus/pershing-square',useSearchParams:()=>new URLSearchParams()},'@/features/notifications/FollowGuru':{FollowGuru:()=>React.createElement('button',{},'구루 저장')}};
const render=component=>renderToStaticMarkup(component);
test('public guru routes and private notification/save routes stay distinct',()=>{
 const {isPublicRoute}=loadTypescript('src/features/auth/public-routes.ts');
 for(const route of ['/gurus','/gurus/pershing-square'])assert.equal(isPublicRoute(route),true);
 for(const route of ['/notifications','/save-interest/AAPL','/search'])assert.equal(isPublicRoute(route),false);
});
test('real guru UI distinguishes report period, submission, raw quantity comparison and original sources',async()=>{
 const {default:Page}=loadTypescript('src/app/gurus/[slug]/page.tsx',common);
 const html=render(await Page({params:Promise.resolve({slug:'pershing-square'}),searchParams:Promise.resolve({})}));
 for(const text of ['2025-06-30','2025-08-14','정확한 공개 시각 미확인','CAP STK CL A','CAP STK CL C'])assert.ok(html.includes(text),text);
 assert.ok(!html.includes('전량 매도'));assert.ok(!html.includes('실제 매입가'));
 const comparable=!catalog[0].archive.versions.some(filing=>filing.disclosureScope?.confidentialOmitted||filing.disclosureScope?.reportType==='combination');
 for(const text of ['실제 매매 수량이 아니며','이번 보고 없음','이전 보고 없음'])assert.equal(html.includes(text),comparable,text);
 assert.equal((html.match(/CUSIP /g)||[]).length,comparable?12:11,'each current or comparable no-longer-reported security appears once');
 assert.equal((html.match(/AMAZON COM INC/g)||[]).length,1,'quantity comparisons do not duplicate the holdings list');
 assert.ok(!html.includes('/stock/'),'unverified CUSIPs do not become guessed stock links');
 assert.ok(html.includes('보고 분기 선택'));assert.ok(html.includes('2025년 1분기'));assert.ok(html.includes('2025년 2분기'));
 const prior=render(await Page({params:Promise.resolve({slug:'pershing-square'}),searchParams:Promise.resolve({filing:'0001172661-25-002315'})}));
 assert.ok(prior.includes('비교할 이전 분기 공시가 없습니다.'));
 await assert.rejects(Page({params:Promise.resolve({slug:'unknown'}),searchParams:Promise.resolve({})}),/not-found/);
 await assert.rejects(Page({params:Promise.resolve({slug:'pershing-square'}),searchParams:Promise.resolve({filing:'unknown'})}),/not-found/);
});
test('guru catalog shows prepared preview metrics without inventing managers or performance',async()=>{
 const {default:Page}=loadTypescript('src/app/gurus/page.tsx',common);
 const html=render(await Page());
 for(const text of ['Pershing Square','Bill Ackman','2025년 2분기','$137.3억','현재 보유 내역과 다를 수 있습니다'])assert.ok(html.includes(text),text);
 assert.equal((html.match(/href="\/gurus\//g)||[]).length,1);
 const {default:Empty}=loadTypescript('src/app/gurus/page.tsx',{...common,'@/features/gurus/directory-repository':{getPreparedDirectory:()=>({summaries:[],pending:[]})}});
 assert.match(render(await Empty()),/확인된 구루 공시가 없습니다/);
 assert.ok(!html.includes('수익률'));assert.ok(html.includes('선정 기준'));
});
test('consolidated holdings preserve share classes, summed manager rows and unknown comparison periods',()=>{
 const {GuruHoldings}=loadTypescript('src/features/gurus/GuruHoldings.tsx',common);
 const filing=structuredClone(catalog[0].archive.versions[1]);
 const original=filing.holdings[0];
 filing.holdings[0]={...original,valueUsd:original.valueUsd-1,shares:original.shares-1};
 filing.holdings.push({...original,rowId:'split-manager',valueUsd:1,shares:1});filing.expectedRows++;
 const html=render(React.createElement(GuruHoldings,{filing,previous:catalog[0].archive.versions[0]}));
 assert.equal((html.match(/CUSIP 02079K107/g)||[]).length,1);
 assert.ok(html.includes('$1,121,819,859'));assert.ok(html.includes('6,324,031주'));
 const distant={...catalog[0].archive.versions[0],period:'2024-12-31'};
 const unknown=render(React.createElement(GuruHoldings,{filing,previous:distant}));
 assert.ok(unknown.includes('보고 범위가 달라 수량 비교를 제공하지 않습니다.'));assert.ok(!unknown.includes('이전 보고 없음'));
 const pending=render(React.createElement(GuruHoldings,{filing,previous:catalog[0].archive.versions[0],pendingCorrection:true}));
 assert.ok(pending.includes('정정 공시를 확인 중인 기간은 수량 비교를 제공하지 않습니다.'));
 assert.ok(!pending.includes('이전 보고 없음'));assert.ok(!pending.includes('이번 보고 없음'));
});
test('confidential or combined reports preserve holdings but label the scope and do not invent quarter changes',async()=>{
 for(const disclosureScope of [{reportType:'holdings',confidentialOmitted:true},{reportType:'combination',confidentialOmitted:false}]){
  const scoped=structuredClone(catalog);
  scoped[0].archive.versions[1].disclosureScope=disclosureScope;
  const {default:Page}=loadTypescript('src/app/gurus/[slug]/page.tsx',{...common,'@/features/gurus/detail-repository':{getGuruDetail:detailReader(scoped)}});
  const html=render(await Page({params:Promise.resolve({slug:'pershing-square'}),searchParams:Promise.resolve({})}));
  assert.ok(html.includes(disclosureScope.confidentialOmitted?'비공개 종목은 제외된 공개 보유 내역입니다.':'다른 운용사가 별도 보고한 내역은 제외됩니다.'));
  assert.ok(html.includes('AMAZON COM INC'));assert.ok(html.includes('보고 범위가 달라 수량 비교를 제공하지 않습니다.'));
  assert.ok(!html.includes('비교할 이전 분기 공시가 없습니다.'));assert.ok(!html.includes('이전 보고 없음'));assert.ok(!html.includes('이번 보고 없음'));
 }
});
test('quarter selection keeps a compact accessible control and changes only the filing URL',()=>{
 const pushes=[];
 const {GuruQuarterSelect}=loadTypescript('src/features/gurus/GuruQuarterSelect.tsx',{...common,
  react:{...React,useId:()=>':quarter:',useTransition:()=>[false,callback=>callback()]},
  'next/navigation':{useRouter:()=>({push:(...args)=>pushes.push(args)})},
 });
 const options=Array.from({length:9},(_,index)=>({accession:`report-${index}`,label:`분기 ${index}`}));
 const tree=GuruQuarterSelect({slug:'pershing-square',selected:'report-0',options});
 const html=render(tree);assert.equal((html.match(/<select/g)||[]).length,1);assert.equal((html.match(/<option/g)||[]).length,9);
 assert.match(html,/aria-label="보고 분기 선택"/);
 tree.props.children[1].props.onChange({target:{value:'report-8'}});
 assert.equal(pushes[0][0],'/gurus/pershing-square?filing=report-8');assert.equal(pushes[0][1].scroll,false);
});
test('notification empty, disconnected, failure, read and unread states have distinct actions without duplicated summaries',()=>{
 let state=null;
 const {Notifications}=loadTypescript('src/features/notifications/Notifications.tsx',{...common,'./NotificationProvider':{useNotificationInbox:()=>state}});
 const html=()=>render(React.createElement(Notifications));
 assert.match(html(),/계정 연결이 필요/);
 state={items:[],ready:true,error:null,pending:false,more:false,reload(){},next(){},markRead(){}};
 assert.match(html(),/새로 확인된 알림이 없습니다/);assert.doesNotMatch(html(),/읽음 표시|더 보기/);
 state.pending=true;assert.match(html(),/알림 확인 중/);assert.doesNotMatch(html(),/새로 확인된 알림이 없습니다/);state.pending=false;
 state.error='연결 실패';assert.match(html(),/role="alert"/);assert.doesNotMatch(html(),/새로 확인된 알림이 없습니다/);
 state.error=null;state.items=[{event_id:'one',kind:'guru_filing',subject_id:'pershing-square',title:'새 보유 공시',source_url:'https://www.sec.gov/Archives/edgar/example',occurred_at:'2026-09-22T00:00:00Z',read_at:null}];
 assert.match(html(),/읽음 표시/);assert.equal((html().match(/새 보유 공시/g)||[]).length,1);
 state.items[0].read_at='2026-09-22T01:00:00Z';assert.doesNotMatch(html(),/읽음 표시/);
});
test('visit summary uses the same unread rows; no baseline, invalid dates or old data invent a change',()=>{
 const {visitSummary}=loadTypescript('src/features/notifications/repository.ts',{'@/lib/supabase':{getSupabaseBrowserClient:()=>null}});
 const item={event_id:'one',read_at:null,delivered_at:'2026-09-22T01:00:00+00:00'};
 const window={since:'2026-09-22T00:00:00Z',visitedAt:'2026-09-22T02:00:00Z'};
 assert.equal(visitSummary([item],null).length,0);assert.equal(visitSummary([item],{...window,since:null}).length,0);
 assert.equal(visitSummary([item],window)[0],item);
 assert.equal(visitSummary([{...item,read_at:'read'}],window).length,0);
 assert.equal(visitSummary([item],{...window,since:'invalid'}).length,0);
 assert.equal(visitSummary([item],{...window,visitedAt:'2026-09-22T00:30:00Z'}).length,0);
});
