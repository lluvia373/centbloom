import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { loadTypescript } from './load-typescript.mjs';
const { runSupabaseRequest } = loadTypescript('src/features/auth/session-request.ts');
const { serverRepository } = loadTypescript('src/features/portfolio/data/server.ts');
const { createLedgerStore } = loadTypescript('src/features/portfolio/data/ledger-store.ts');
const userId = '00000000-0000-4000-8000-000000000001';
const session = (token='old', id=userId) => ({access_token:token,refresh_token:'qa-refresh',user:{id}});
const jwtError = (message='JWT expired') => ({code:'PGRST303',message,details:null,hint:null});
const ok = data => ({data,error:null});
function setup(respond) {
  let current=session(), refreshCount=0;
  const requests=[];
  const client=createClient('https://session-qa.invalid','qa-publishable',{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{fetch:async (url,init)=>{
      const request={path:new URL(url).pathname,token:init.headers.get('Authorization'),body:init.body?JSON.parse(init.body):null};
      requests.push(request);
      const result=await respond(request,requests.length);
      return new Response(JSON.stringify(result.data??result.error),{status:result.error?401:200,headers:{'Content-Type':'application/json'}});
    }},
  });
  client.auth.getSession=async()=>({data:{session:current},error:null});
  client.auth.refreshSession=async()=>{refreshCount++;await new Promise(r=>setTimeout(r,5));current=session('fresh');return {data:{session:current},error:null};};
  return {client,requests,refreshes:()=>refreshCount,setSession:value=>{current=value;}};
}
const read = ({client},signal) => runSupabaseRequest(client,userId,signal=>client.rpc('read_portfolio_ledger').abortSignal(signal),signal);

test('fresh login and expired-token rejection recover before the ledger publishes an error',async()=>{
  const fixture=setup(r=>r.token==='Bearer old'?{error:jwtError()}:ok({revision:'0',transactions:[]}));
  const store=createLedgerStore({repository:serverRepository(fixture.client,userId)});
  const states=[];store.subscribe(()=>states.push(store.getSnapshot().status));
  await store.start();
  assert.equal(store.getSnapshot().status,'ready');assert.equal(store.getSnapshot().error,null);
  assert.ok(!states.includes('failed'));assert.equal(fixture.refreshes(),1);
  assert.deepEqual(fixture.requests.map(r=>r.token),['Bearer old','Bearer fresh']);
  store.dispose();
});

test('simultaneous transaction, preference and performance reads share one refresh',async()=>{
  const fixture=setup(r=>r.token==='Bearer old'?{error:jwtError()}:ok([]));
  const results=await Promise.all(['portfolio_transactions','portfolio_preferences','portfolio_snapshots'].map(table=>runSupabaseRequest(fixture.client,userId,signal=>fixture.client.from(table).select('*').abortSignal(signal))));
  assert.ok(results.every(result=>!result.error));assert.equal(fixture.refreshes(),1);
  assert.equal(fixture.requests.length,6);
});

test('a newer session from another tab is reused without another refresh',async()=>{
  let fixture;
  fixture=setup((_,n)=>{if(n===1){fixture.setSession(session('other-tab'));return {error:jwtError()};}return ok([]);});
  await read(fixture);assert.equal(fixture.refreshes(),0);assert.equal(fixture.requests[1].token,'Bearer other-tab');
});

test('future-issued token waits and recovers without minting another future token',async()=>{
  const fixture=setup((_,n)=>n===1?{error:jwtError('JWT issued at future')}:ok([]));
  const started=Date.now();await read(fixture);
  assert.ok(Date.now()-started>=900);assert.equal(fixture.refreshes(),0);assert.equal(fixture.requests.length,2);
});

test('future-issued failures have a bounded retry budget',async()=>{
  const fixture=setup(()=>({error:jwtError('JWT not yet valid')}));
  await assert.rejects(read(fixture),/시간 확인이 지연/);
  assert.equal(fixture.requests.length,4);assert.equal(fixture.refreshes(),0);
});

test('unrecoverable token errors stop after one refresh',async()=>{
  const fixture=setup(()=>({error:jwtError()}));
  await assert.rejects(read(fixture),/다시 로그인/);
  assert.equal(fixture.requests.length,2);assert.equal(fixture.refreshes(),1);
});

test('logout and account switch during a request never replay under the next account',async()=>{
  for(const next of [null,session('other','another-user')]) {
    let fixture;fixture=setup(()=>{fixture.setSession(next);return {error:jwtError()};});
    await assert.rejects(read(fixture),/로그인|계정이 변경/);
    assert.equal(fixture.requests.length,1);assert.equal(fixture.refreshes(),0);
  }
});

test('missing session never sends an anonymous account RPC',async()=>{
  const fixture=setup(()=>ok([]));fixture.setSession(null);
  await assert.rejects(read(fixture),/다시 로그인/);assert.equal(fixture.requests.length,0);
});

test('clock-skew wait and auth refresh respect the caller deadline',async()=>{
  const fixture=setup(()=>({error:jwtError('JWT issued at future')}));
  const controller=new AbortController();const result=read(fixture,controller.signal);
  setTimeout(()=>controller.abort(),30);await assert.rejects(result,{name:'AbortError'});
  assert.equal(fixture.requests.length,1);
  const stalled=setup(()=>({error:jwtError()}));stalled.client.auth.refreshSession=()=>new Promise(()=>{});
  const stop=new AbortController();const pending=read(stalled,stop.signal);
  setTimeout(()=>stop.abort(),30);await assert.rejects(pending,{name:'AbortError'});
  assert.equal(stalled.requests.length,1);
});

test('JWT-rejected save reuses its request ID, revision and exact transaction payload',async()=>{
  const fixture=setup((_,n)=>n===1?{error:jwtError()}:ok({revision:'2',transactions:[]}));
  const repository=serverRepository(fixture.client,userId);
  await repository.commit({id:'qa-receipt',revision:'1',transactions:[]});
  assert.equal(fixture.requests.length,2);
  assert.deepEqual(fixture.requests[0].body,fixture.requests[1].body);
  assert.equal(fixture.requests[1].body.request_id,'qa-receipt');
  assert.equal(fixture.requests[1].body.expected_revision,'1');
});

test('network ambiguity, conflicts and non-JWT permission errors never trigger automatic writes',async()=>{
  for(const error of [{code:'42501',message:'permission denied'},{code:'40001',message:'conflict'}]) {
    const fixture=setup(()=>({error}));
    await assert.rejects(serverRepository(fixture.client,userId).commit({id:'same',revision:'0',transactions:[]}));
    assert.equal(fixture.requests.length,1);assert.equal(fixture.refreshes(),0);
  }
  const fixture=setup(()=>{throw new TypeError('network lost after commit');});
  await assert.rejects(serverRepository(fixture.client,userId).commit({id:'same',revision:'0',transactions:[]}));
  assert.equal(fixture.requests.length,1);assert.equal(fixture.refreshes(),0);
});

test('AuthProvider uses ordered auth events, unsubscribes and ignores late events',()=>{
  const values=[];let onChange,cleanup,unsubscribed=false;
  const {AuthProvider}=loadTypescript('src/hooks/useAuth.tsx',{
    react:{createContext:()=>({Provider:'auth-provider'}),useState:()=>[null,value=>values.push(value)],useEffect:effect=>{cleanup=effect();},useMemo:fn=>fn(),useCallback:fn=>fn},
    '@/lib/supabase':{isSupabaseConfigured:()=>true,getSupabaseBrowserClient:()=>({auth:{onAuthStateChange:callback=>{onChange=callback;return {data:{subscription:{unsubscribe:()=>{unsubscribed=true;}}}};}}})},
  });
  AuthProvider({children:null});
  onChange('INITIAL_SESSION',session());onChange('SIGNED_IN',session('new','new-user'));onChange('SIGNED_OUT',null);
  assert.deepEqual(values.map(v=>v?.id??v),[userId,false,'new-user',false,null,false]);
  cleanup();onChange('SIGNED_IN',session());assert.equal(values.length,6);assert.ok(unsubscribed);
});

test('preference single-row reads and writes recover through their real repository',async()=>{
  const fixture=setup(r=>r.token==='Bearer old'?{error:jwtError()}:ok({display_currency:'USD'}));
  const repository=loadTypescript('src/features/portfolio/data/preferences.ts',{'@/lib/supabase':{getSupabaseBrowserClient:()=>fixture.client}});
  assert.equal(await repository.readDisplayCurrency(userId),'USD');
  fixture.setSession(session());
  await repository.saveDisplayCurrency(userId,'KRW');
  const saves=fixture.requests.filter(r=>r.body);
  assert.equal(saves.length,2);assert.deepEqual(saves[0].body,saves[1].body);
  assert.equal(saves[0].body.display_currency,'KRW');
});

test('performance single-row and paged reads share auth recovery',async()=>{
  const fixture=setup(r=>r.token==='Bearer old'?{error:jwtError()}:ok(r.path.endsWith('portfolio_preferences')?{portfolio_started_at:null}:[]));
  const repository=loadTypescript('src/features/performance/repository.ts',{'@/lib/supabase':{getSupabaseBrowserClient:()=>fixture.client}});
  const result=await repository.readHistory(userId,'0',new AbortController().signal);
  assert.equal(result.saved,null);assert.equal(result.startedAt,null);assert.equal(fixture.refreshes(),1);
});
