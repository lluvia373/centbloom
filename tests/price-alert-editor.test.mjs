import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadTypescript } from './load-typescript.mjs';
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
function harness(onSave) {
  const slots=[];let cursor=0,current=true,closed=0;
  const hooks={...React,useRef(initial){return slots[cursor++]??={current:initial};},useState(initial){
    const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;
    return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];
  }};
  const {PriceAlertEditor}=loadTypescript('src/features/watchlist/PriceAlertEditor.tsx',{
    react:hooks,'./PriceAlertEditor.module.css':{default:new Proxy({},{get:(_,key)=>key})},
    '@/shared/react/use-operation-scope':{useOperationScope:()=>()=>()=>current},
  });
  const props={symbol:'AAPL',currency:'USD',rules:[{direction:'below',threshold:100,currency:'USD',enabled:true}],pending:false,onSave,onClose:()=>{closed++;}};
  return {props,draw(){cursor=0;return PriceAlertEditor(props);},closed:()=>closed,expire(){current=false;}};
}
test('price editor coalesces rapid submissions and retries a failed write with the identical receipt',async()=>{
  const wait=deferred(),calls=[];let reject=true;
  const h=harness(async(rules,id)=>{calls.push({rules,id});if(calls.length===1)return wait.promise;if(reject)throw new Error('network');return null;});
  const submit=h.draw().props.onSubmit;
  const first=submit({preventDefault(){}});await submit({preventDefault(){}});assert.equal(calls.length,1);
  wait.resolve('연결 실패');await first;assert.equal(h.closed(),0);
  await h.draw().props.onSubmit({preventDefault(){}});
  assert.match(renderToStaticMarkup(h.draw()),/가격 알림을 저장하지 못했습니다/);
  assert.equal(calls[0].id,calls[1].id);
  reject=false;await h.draw().props.onSubmit({preventDefault(){}});assert.equal(h.closed(),1);assert.equal(calls[1].id,calls[2].id);
});
test('price editor never closes a new account or unmounted form after an old save',async()=>{
  const wait=deferred(),h=harness(()=>wait.promise);
  const pending=h.draw().props.onSubmit({preventDefault(){}});h.expire();wait.resolve(null);await pending;
  assert.equal(h.closed(),0);
});
