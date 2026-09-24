
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTypescript} from './load-typescript.mjs';

// Test error presentation separately; session-request.test.mjs covers real SDK recovery.
const {serverRepository}=loadTypescript('src/features/portfolio/data/server.ts',{
 '@/features/auth/session-request':{runSupabaseRequest:(_client,_userId,request)=>request(AbortSignal.timeout(20_000))},
});
test('ledger read distinguishes auth, permission, timeout and network errors without leaking server details',async()=>{
 for (const [code,status,message,pattern] of [
  ['PGRST301',401,'sensitive token',/다시 로그인/],
  ['42501',403,'private table',/기록을 열지/],
  ['',0,'TimeoutError: timed out',/시간이 걸리고/],
  ['',0,'Failed to fetch',/인터넷 연결/],
  ['XX000',500,'private SQL',/불러오지 못했어요/],
 ]) {
  const repo=serverRepository({rpc:()=>({abortSignal:async()=>({error:{code,message},status})})},'test-user');
  await assert.rejects(repo.read(),e=>e.issue==='load'&&pattern.test(e.message)&&!e.message.includes(message)&&!/(HTTP|PGRST|42501|XX000)/.test(e.message));
 }
});
test('ledger read retains valid records and missing-RPC read-only fallback',async()=>{
 const row={id:'test',symbol:'QA',name:'QA',transaction_type:'buy',trade_date:'2026-09-01',quantity:1,price:100,fee:0,created_at:'2026-09-01T00:00:00Z'};
 const chain={select(){return this},eq(){return this},order(){return this},range(){return this},abortSignal:async()=>({data:[row],error:null,status:200})};
 const client={rpc:()=>({abortSignal:async()=>({data:{revision:'r1',transactions:[row],portfolios:[{id:'00000000-0000-4000-8000-000000000001',name:'기본 포트폴리오',created_at:'2026-09-01T00:00:00Z',is_default:true}]},error:null,status:200})}),from:()=>chain};
 const loaded=await serverRepository(client,'test-user').read();
 assert.equal(loaded.transactions[0].symbol,'QA');assert.equal(loaded.writable,true);
 client.rpc=()=>({abortSignal:async()=>({error:{code:'PGRST202',message:'missing'},status:404})});
 const fallback=await serverRepository(client,'test-user').read();
 assert.equal(fallback.writable,false);assert.equal(fallback.transactions.length,1);
});
test('auth uses session events without a competing network getUser response; cleanup ignores later events',()=>{
 let callback,cleanup,unsubscribed=false,getUserCalls=0;
 const updates=[[],[]];let hook=0;
 const react={createContext:()=>({Provider:'provider'}),useState:initial=>{const i=hook++;return [initial,value=>updates[i].push(value)]},useEffect:effect=>{cleanup=effect()},useMemo:f=>f(),useCallback:f=>f};
 const client={auth:{getUser:()=>{getUserCalls++;return new Promise(()=>{})},onAuthStateChange:cb=>{callback=cb;return {data:{subscription:{unsubscribe:()=>unsubscribed=true}}}}}};
 const {AuthProvider}=loadTypescript('src/hooks/useAuth.tsx',{'react':react,'@/lib/supabase':{isSupabaseConfigured:()=>true,getSupabaseConfigurationError:()=>null,getSupabaseBrowserClient:()=>client}});
 AuthProvider({children:null});
 callback('INITIAL_SESSION',{user:{id:'one'}});
 callback('SIGNED_OUT',null);
 callback('SIGNED_IN',{user:{id:'two'}});
 assert.equal(getUserCalls,0);assert.equal(updates[0].at(-1).id,'two');assert.equal(updates[1].at(-1),false);
 cleanup();callback('SIGNED_OUT',null);
 assert.equal(unsubscribed,true);assert.equal(updates[0].at(-1).id,'two');
});

for (const failure of [null, new Error('authentication server unavailable')]) {
 test(`sign-out ${failure ? 'failure reaches the settings error handler' : 'success resolves normally'}`, async () => {
  let calls=0;
  const react={createContext:()=>({Provider:'provider'}),useState:initial=>[initial,()=>{}],useEffect:()=>{},useMemo:fn=>fn(),useCallback:fn=>fn};
  const client={auth:{signOut:async()=>{calls++;return {error:failure};}}};
  const {AuthProvider}=loadTypescript('src/hooks/useAuth.tsx',{
   react,
   '@/lib/supabase':{isSupabaseConfigured:()=>true,getSupabaseConfigurationError:()=>null,getSupabaseBrowserClient:()=>client},
  });
  const {signOut}=AuthProvider({children:null}).props.value;
  if(failure) await assert.rejects(signOut(),error=>error===failure);
  else await assert.doesNotReject(signOut());
  assert.equal(calls,1);
 });
}
