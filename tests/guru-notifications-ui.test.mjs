import test from 'node:test';import assert from 'node:assert/strict';
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {loadTypescript} from './load-typescript.mjs';
const css={default:new Proxy({},{get:(_,key)=>String(key)})};
const common={'next/link':{default:({children,...props})=>React.createElement('a',props,children)},'@/features/gurus/Guru.module.css':css,'next/navigation':{notFound:()=>{throw Error('not-found')}},'@/features/notifications/FollowGuru':{FollowGuru:()=>React.createElement('button',{},'구루 저장')}};
const render=component=>renderToStaticMarkup(component);
test('public guru routes and private notification/save routes stay distinct',()=>{
 const {isPublicRoute}=loadTypescript('src/features/auth/public-routes.ts');
 for(const route of ['/gurus','/gurus/pershing-square'])assert.equal(isPublicRoute(route),true);
 for(const route of ['/notifications','/save-interest/AAPL','/search'])assert.equal(isPublicRoute(route),false);
});
test('real guru UI distinguishes report period, submission, raw quantity comparison and original sources',async()=>{
 const {default:Page}=loadTypescript('src/app/gurus/[slug]/page.tsx',common);
 const html=render(await Page({params:Promise.resolve({slug:'pershing-square'}),searchParams:Promise.resolve({})}));
 for(const text of ['2025-06-30','2025-08-14','정확한 공개 시각 미확인','실제 매매 수량이 아니며','이번 보고 없음','이전 보고 없음','CAP STK CL A','CAP STK CL C'])assert.ok(html.includes(text),text);
 assert.ok(!html.includes('전량 매도'));assert.ok(!html.includes('실제 매입가'));
 assert.equal((html.match(/티커 연결 미확인/g)||[]).length,11);
 const prior=render(await Page({params:Promise.resolve({slug:'pershing-square'}),searchParams:Promise.resolve({filing:'0001172661-25-002315'})}));
 assert.ok(prior.includes('비교할 이전 분기 공시가 없습니다.'));
 await assert.rejects(Page({params:Promise.resolve({slug:'unknown'}),searchParams:Promise.resolve({})}),/not-found/);
});
test('notification empty, disconnected, failure, read and unread states have distinct actions without duplicated summaries',()=>{
 let state=null;
 const {Notifications}=loadTypescript('src/features/notifications/Notifications.tsx',{...common,'./NotificationProvider':{useNotificationInbox:()=>state}});
 const html=()=>render(React.createElement(Notifications));
 assert.match(html(),/계정 연결이 필요/);
 state={items:[],ready:true,error:null,pending:false,more:false,reload(){},next(){},markRead(){}};
 assert.match(html(),/새로 확인된 알림이 없습니다/);assert.doesNotMatch(html(),/읽음 표시|더 보기/);
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
