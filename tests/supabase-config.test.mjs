import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createElement} from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {loadTypescript} from './load-typescript.mjs';

function loadWithGlobals(path, globals={}) {
  const exports={};
  const {outputText}=ts.transpileModule(readFileSync(path,'utf8'),{fileName:path,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}});
  runInNewContext(outputText,{exports,URL,atob,...globals},{filename:path});
  return exports;
}
const model=loadWithGlobals('src/features/auth/supabase-config.ts');
const prod=model.PRODUCTION_SUPABASE_PROJECT_REF;
const dev='abcdefghijklmnopqrst';
const publicHost='centbloom.stock-web-demo.workers.dev';
const key='sb_publishable_test-key';
const input=(ref=dev,extra={})=>({url:`https://${ref}.supabase.co`,publishableKey:key,nodeEnv:'development',hostname:'localhost',developmentProjectRef:dev,...extra});
const jwt=(claims={},header={alg:'HS256',typ:'JWT'})=>[header,{iss:'supabase',ref:dev,role:'anon',exp:4102444800,...claims}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).concat('a'.repeat(43)).join('.');

test('missing both public values keeps guest mode; partial configuration fails closed',()=>{
  assert.equal(model.validateSupabaseConfiguration({nodeEnv:'development'}).status,'guest');
  for(const config of [{url:input().url},{publishableKey:key}]) {
    assert.equal(model.validateSupabaseConfiguration(config).code,'incomplete');
  }
});

test('local development requires the explicitly matching separate project',()=>{
  assert.equal(model.validateSupabaseConfiguration(input()).status,'configured');
  assert.equal(model.validateSupabaseConfiguration(input(dev,{developmentProjectRef:undefined})).code,'missing-development-ref');
  assert.equal(model.validateSupabaseConfiguration(input(dev,{developmentProjectRef:'another-project'})).code,'development-ref-mismatch');
  for(const hostname of ['localhost','127.0.0.1','127.2.3.4','[::1]','0.0.0.0','192.168.1.10','10.1.2.3','172.16.1.2','centbloom.local']) {
    assert.equal(model.validateSupabaseConfiguration(input(prod,{hostname,nodeEnv:'production',developmentProjectRef:undefined})).code,'production-in-development',hostname);
    assert.equal(model.validateSupabaseConfiguration(input(dev,{hostname,nodeEnv:'production'})).status,'configured',hostname);
  }
  assert.equal(model.validateSupabaseConfiguration(input(prod,{hostname:undefined,developmentProjectRef:undefined})).code,'production-in-development');
});

test('existing public production config works while a dev project on a public host is blocked',()=>{
  const deployed={hostname:publicHost,nodeEnv:'production',developmentProjectRef:undefined};
  assert.equal(model.validateSupabaseConfiguration(input(prod,deployed)).status,'configured');
  assert.equal(model.validateSupabaseConfiguration(input(prod,{...deployed,publishableKey:jwt({ref:prod})})).status,'configured');
  assert.equal(model.validateSupabaseConfiguration(input(dev,deployed)).code,'development-on-public-host');
  assert.equal(model.validateSupabaseConfiguration(input(dev,{...deployed,developmentProjectRef:dev})).code,'development-on-public-host');
  for(const hostname of ['localhost.evil.test','127.evil.test','10.evil.test','192.168.evil.test','172.16.evil.test','127.1.2.999']) {
    assert.equal(model.isLocalHostname(hostname),false,hostname);
    assert.equal(model.validateSupabaseConfiguration(input(dev,{hostname})).code,'development-on-public-host',hostname);
  }
});

test('project URL rejects non-Supabase addresses, insecure schemes and embedded URL data',()=>{
  for(const url of ['garbage',`http://${dev}.supabase.co`,`https://${dev}.supabase.co.evil.test`,`https://user@${dev}.supabase.co`,`https://${dev}.supabase.co:8443`,`https://${dev}.supabase.co/path`,`https://${dev}.supabase.co?ref=${prod}`,`https://${dev}.supabase.co#token`]) {
    assert.equal(model.validateSupabaseConfiguration(input(dev,{url})).code,'invalid-url',url);
  }
});

test('browser keys reject secret, service_role and malformed/mismatched legacy anon tokens',()=>{
  assert.equal(model.validateSupabaseConfiguration(input(dev,{publishableKey:jwt()})).status,'configured');
  for(const publishableKey of ['sb_secret_private','sb_publishable_','not-a-key','a.b.c',jwt({role:'service_role'}),jwt({ref:prod}),jwt({iss:'other'}),jwt({exp:1}),jwt({exp:'4102444800'}),jwt({}, {alg:'none',typ:'JWT'}),jwt().slice(0,-1)]) {
    const config=model.validateSupabaseConfiguration(input(dev,{publishableKey}));
    assert.equal(config.code,'invalid-browser-key');
    assert.ok(!config.message.includes(publishableKey));
  }
});

function clientModule(config,hostname='localhost') {
  const calls=[];
  const env={NODE_ENV:config.nodeEnv,NEXT_PUBLIC_SUPABASE_URL:config.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:config.publishableKey,NEXT_PUBLIC_SUPABASE_DEV_PROJECT_REF:config.developmentProjectRef};
  const sdkClient={auth:{}};
  const library=loadWithGlobals('src/lib/supabase.ts',{
    process:{env},...(hostname===null?{}:{window:{location:{hostname}}}),
    require:name=>name==='@/features/auth/supabase-config'?model:{createClient:(...args)=>{calls.push(args);return sdkClient;}},
  });
  return {library,calls,sdkClient};
}

test('client factory makes no SDK client for missing, partial or unsafe config and creates one for dev',()=>{
  for(const config of [input(prod),input(dev,{developmentProjectRef:undefined}),input(dev,{publishableKey:undefined})]) {
    const {library,calls}=clientModule(config);
    assert.equal(library.isSupabaseConfigured(),true);
    assert.equal(typeof library.getSupabaseConfigurationError(),'string');
    assert.throws(()=>library.getSupabaseBrowserClient());
    assert.equal(calls.length,0);
  }
  const guest=clientModule({});
  assert.equal(guest.library.isSupabaseConfigured(),false);
  assert.equal(guest.library.getSupabaseBrowserClient(),null);
  assert.equal(guest.calls.length,0);
  const safe=clientModule(input());
  assert.equal(safe.library.getSupabaseBrowserClient(),safe.sdkClient);
  assert.equal(safe.library.getSupabaseBrowserClient(),safe.sdkClient);
  assert.equal(safe.calls.length,1);
  assert.equal(safe.calls[0][0],input().url);
  assert.equal(safe.calls[0][2].auth.detectSessionInUrl,true);
  const server=clientModule(input(dev,{nodeEnv:'production'}),null);
  assert.equal(server.library.getSupabaseBrowserClient(),null);
  assert.equal(server.calls.length,0);
});

test('invalid auth is settled without session requests and blocks public/private child providers',async()=>{
  let clients=0;
  const message='개발용 로그인 연결 설정을 확인해 주세요.';
  const {AuthProvider}=loadTypescript('src/hooks/useAuth.tsx',{
    react:{createContext:()=>({Provider:'auth-provider'}),useState:initial=>[initial,()=>{}],useEffect:effect=>effect(),useMemo:fn=>fn(),useCallback:fn=>fn},
    '@/lib/supabase':{isSupabaseConfigured:()=>true,getSupabaseConfigurationError:()=>message,getSupabaseBrowserClient:()=>{clients++;throw Error('unsafe');}},
  });
  const state=AuthProvider({children:null}).props.value;
  assert.equal(state.loading,false);
  assert.equal(state.configured,true);
  assert.equal(await state.signInWithGoogle(),message);
  assert.equal(clients,0);
  for(const pathname of ['/','/portfolio']) {
    const {AuthGate}=loadTypescript('src/components/AuthGate.tsx',{
      'next/navigation':{usePathname:()=>pathname},'@/hooks/useAuth':{useAuth:()=>state},'@/app/auth.css':{},
    });
    const html=renderToStaticMarkup(createElement(AuthGate,null,'CHILD_STORAGE_PROVIDER'));
    assert.match(html,/role="alert"/);
    assert.ok(html.includes(message));
    assert.doesNotMatch(html,/CHILD_STORAGE_PROVIDER|로그인 상태를 확인/);
  }
});

test('Google login keeps the current origin and cancels the saved return on failure',async()=>{
  const loginReturn=loadTypescript('src/features/auth/login-return.ts');
  const storage=new Map();
  const sessionStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
  const calls=[];
  let failure=null;
  const modules={
    'react':{createContext:()=>({Provider:'auth-provider'}),useState:initial=>[initial,()=>{}],useEffect:()=>{},useMemo:fn=>fn(),useCallback:fn=>fn},
    'react/jsx-runtime':jsxRuntime,
    '@/features/auth/login-return':loginReturn,
    '@/lib/supabase':{isSupabaseConfigured:()=>true,getSupabaseConfigurationError:()=>null,getSupabaseBrowserClient:()=>({auth:{signInWithOAuth:async options=>{calls.push(options);return {error:failure};}}})},
  };
  const {AuthProvider}=loadWithGlobals('src/hooks/useAuth.tsx',{
    require:name=>modules[name],
    window:{location:{origin:'http://localhost:3000',pathname:'/search',search:'?symbol=AAPL'},sessionStorage},
  });
  const {signInWithGoogle}=AuthProvider({children:null}).props.value;
  assert.equal(await signInWithGoogle(),null);
  assert.equal(calls[0].provider,'google');
  assert.equal(calls[0].options.redirectTo,'http://localhost:3000');
  assert.equal(loginReturn.takeLoginReturn(sessionStorage),'/search?symbol=AAPL');
  failure={message:'Cancelled'};
  assert.equal(await signInWithGoogle(),'Cancelled');
  assert.equal(loginReturn.takeLoginReturn(sessionStorage),null);
});
