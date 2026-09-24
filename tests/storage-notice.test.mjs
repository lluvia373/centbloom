import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { loadTypescript } from './load-typescript.mjs';

const defaults = { placement:'inline', pathname:'/portfolio', status:'ready', issue:null, writable:true,
  preferenceError:null, onRetry:async()=>{}, onReload:async()=>{} };
const overrides = {
  '@/hooks/useAuth': {useAuth:()=>({user:{id:'owner'}})},
  '@/hooks/usePortfolio': {}, 'next/navigation': {},
  './StorageNotice.module.css': {default:new Proxy({}, {get:(_,key)=>key})},
  'next/link': {default:({children,...props})=>React.createElement('a',props,children)},
};
const {StorageFeedback}=loadTypescript('src/components/StorageNotice.tsx',overrides);
const html=props=>renderToStaticMarkup(React.createElement(StorageFeedback,{...defaults,...props}));

test('healthy and unrelated pages have no routine storage banner',()=>{
  assert.equal(html({}), '');
  for(const pathname of ['/', '/gurus', '/watchlist', '/journal', '/settings', '/stock/AAPL'])
    for(const state of [{writable:false}, {status:'failed',issue:'load'}, {status:'saving'}, {issue:'command'}, {preferenceError:'secret diagnostic'}])
      assert.equal(html({pathname,placement:'global',...state}), '');
});
test('read-only is one neutral line under the affected page title, with no fake retry',()=>{
  const output=html({writable:false});
  assert.match(output,/보유내역은 확인할 수 있습니다/);
  assert.match(output,/role="status"/);
  assert.doesNotMatch(output,/서버|업데이트|HTTP|button|dialog|저장 재시도/);
  assert.equal(html({writable:false,placement:'global'}),'');
  assert.match(html({writable:false,pathname:'/search'}),/거래 추가·수정을 사용할 수 없습니다/);
  const form=readFileSync('src/components/TransactionForm.tsx','utf8');
  assert.ok(form.indexOf('<StorageNotice placement="inline"')<form.indexOf('<form'));
  assert.match(form,/disabled=\{saving \|\| isAggregate \|\| writable === false/);
  for(const path of ['src/app/portfolio/page.tsx','src/app/transactions/page.tsx']) {
    const source=readFileSync(path,'utf8');
    assert.ok(source.indexOf('<StorageNotice placement="inline"')>source.indexOf('<PageHeading'));
  }
});
test('load failure has one non-destructive reload action and no raw exception',()=>{
  const output=html({status:'failed',issue:'load',error:'HTTP 503 PGRST202 secret'});
  assert.match(output,/거래 기록을 불러오지 못했습니다/);
  assert.equal((output.match(/<button/g)??[]).length,1);
  assert.match(output,/다시 불러오기/);
  assert.doesNotMatch(output,/HTTP|PGRST|secret|dialog/);
});
test('unconfirmed save remains visible outside investment pages but links to recovery',()=>{
  for(const issue of ['pending-save','conflict','cache']) {
    const output=html({placement:'global',pathname:'/gurus',status:'failed',issue});
    assert.match(output,/href="\/transactions"/); assert.match(output,/거래 확인/);
    assert.doesNotMatch(output,/<button|dialog/);
  }
});
test('conflict never offers a retry that cannot resolve it; cache confirms saved status',()=>{
  const conflict=html({status:'failed',issue:'conflict'});
  assert.match(conflict,/이번 수정이 저장되지 않았습니다/);
  assert.doesNotMatch(conflict,/다시 확인/);
  assert.match(html({status:'cache-failed',issue:'cache'}),/거래는 저장됐지만/);
});
test('currency failure points to currency settings, never transaction recovery',()=>{
  const output=html({preferenceError:'표시 통화 서버 저장 오류'});
  assert.match(output,/href="\/settings"/);
  assert.doesNotMatch(output,/서버|<button|거래 기록|dialog/);
});
test('routine saving is polite and command validation stays with the form',()=>{
  assert.match(html({status:'saving'}),/role="status".*aria-busy="true"/);
  assert.doesNotMatch(html({status:'saving'}),/role="alert"|<button/);
  assert.equal(html({issue:'command'}),'');
});
test('recovery requires dialog confirmation; cancel does not abandon pending changes',async()=>{
  const refs=[],states=[],calls=[];let cursor=0,refCursor=0;
  const {StorageFeedback:View}=loadTypescript('src/components/StorageNotice.tsx',{
    ...overrides, react:{...React,useId:()=> 'recover',useRef:value=>refs[refCursor++]??(refs[refCursor-1]={current:value}),
      useState:initial=>{const index=cursor++;if(!(index in states))states[index]=initial;return [states[index],value=>states[index]=value];}},
  });
  const nodes=value=>Array.isArray(value)?value.flatMap(nodes):value?.props?[value,...nodes(value.props.children)]:[];
  const draw=()=>{cursor=0;refCursor=0;return nodes(View({...defaults,status:'failed',issue:'pending-save',
    onRetry:async()=>calls.push('retry'),onReload:async options=>calls.push(options)}));};
  let tree=draw();let open=false;
  refs[0].current={showModal:()=>open=true,close:()=>open=false};
  const trigger=tree.find(n=>n.type==='button'&&n.props.ref===refs[1]);
  trigger.props.onClick(); assert.equal(open,true); assert.deepEqual(calls,[]);
  tree.find(n=>n.type==='button'&&n.props.children==='취소').props.onClick();
  assert.equal(open,false);assert.deepEqual(calls,[]);
  trigger.props.onClick();
  tree.find(n=>n.type==='button'&&n.props.className==='button-primary').props.onClick();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.length,1);assert.equal(calls[0].discardPending,true);assert.equal(open,false);
  tree=draw();assert.ok(tree.find(n=>n.type==='dialog').props['aria-describedby']);
  cursor=0;refCursor=0;
  tree=nodes(View({...defaults,status:'failed',issue:'load',onRetry:async()=>calls.push('unexpected save'),onReload:async options=>calls.push(options)}));
  tree.find(n=>n.type==='button'&&n.props.children==='다시 불러오기').props.onClick();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.length,2);assert.equal(calls[1],undefined);
});
