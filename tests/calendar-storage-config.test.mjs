import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';

const require=createRequire(import.meta.url);
function load(path,env,overrides={}) {
  const exports={};
  const {outputText}=ts.transpileModule(readFileSync(path,'utf8'),{fileName:path,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
  runInNewContext(outputText,{exports,process:{env},URL,URLSearchParams,AbortSignal,atob,fetch:overrides.fetch,require:name=>overrides[name]??require(name)},{filename:path});
  return exports;
}
const config=load('src/features/auth/supabase-config.ts',{});
const prod=config.PRODUCTION_SUPABASE_PROJECT_REF;
const dev='tocdnobpkbpczjzbenbd';
const publicHost='centbloom.stock-web-demo.workers.dev';
const signal=new AbortController().signal;
const settings=(ref,nodeEnv='production')=>({NODE_ENV:nodeEnv,NEXT_PUBLIC_SUPABASE_URL:`https://${ref}.supabase.co`,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test-key',SUPABASE_SERVICE_ROLE_KEY:'server-test-key',...(ref===dev?{NEXT_PUBLIC_SUPABASE_DEV_PROJECT_REF:dev}:{})});
function fixture(env) {
  const requests=[];
  const repository=load('src/features/calendar/server/repository.ts',env,{
    '@/features/auth/supabase-config':config,
    fetch:async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>[]};},
  });
  return {repository,requests};
}

test('calendar refuses local production reads/writes before fetch, including production-mode direct scripts',async()=>{
  for(const nodeEnv of ['development','production',undefined]) {
    for(const hostname of [undefined,'localhost','127.0.0.1']) {
      const {repository,requests}=fixture({...settings(prod),NODE_ENV:nodeEnv});
      await assert.rejects(repository.readReleases({},signal,hostname),/configuration/);
      await assert.rejects(repository.saveReleases([],signal,hostname),/configuration/);
      assert.equal(requests.length,0);
    }
  }
});

test('calendar allows matching local development target and existing public production target',async()=>{
  for(const [ref,hostname] of [[dev,'localhost'],[prod,publicHost]]) {
    const {repository,requests}=fixture(settings(ref));
    await repository.readReleases({id:'test'},signal,hostname);
    await repository.saveReleases([],signal,hostname);
    assert.equal(requests.length,2);
    assert.ok(requests.every(request=>request.url.startsWith(`https://${ref}.supabase.co/rest/v1/`)));
    assert.equal(requests[0].options.method,'GET');
    assert.equal(requests[1].options.method,'POST');
  }
  const {repository,requests}=fixture(settings(dev));
  await assert.rejects(repository.saveReleases([],signal,publicHost),/configuration/);
  assert.equal(requests.length,0);
});

test('calendar API supplies actual request host and rejects unsafe sync before fetching a provider',async()=>{
  const {NextRequest,NextResponse}=await import('next/server.js');
  const env={...settings(prod),CALENDAR_ARCHIVE_ENABLED:'true',CALENDAR_SYNC_SECRET:'test-secret',TRADING_ECONOMICS_API_KEY:'provider-test-key'};
  const {repository,requests}=fixture(env);
  let providerCalls=0;
  const model={validMonth:month=>month==='2026-09',shiftMonth:()=> '2026-10'};
  const overrides={
    'next/server':{NextRequest,NextResponse},
    '@/features/calendar/server/repository':repository,
    '@/features/calendar/server/provider':{fetchReleases:async()=>{providerCalls++;return [];}},
    '@/features/calendar/model':model,
    '@/features/calendar/records':{preparedCalendarRecords:[]},
    '@/features/calendar/server/query':{calendarQuery:()=>({id:'test'})},
  };
  const {GET}=load('src/app/api/calendar/route.ts',env,overrides);
  const {POST}=load('src/app/api/calendar/sync/route.ts',env,overrides);
  assert.equal((await GET(new NextRequest('http://localhost/api/calendar?event=test'))).status,503);
  assert.equal((await POST(new NextRequest('http://localhost/api/calendar/sync?month=2026-09',{method:'POST',headers:{authorization:'Bearer test-secret'}}))).status,502);
  assert.equal(requests.length,0);
  assert.equal(providerCalls,0);
  assert.equal((await GET(new NextRequest(`https://${publicHost}/api/calendar?event=test`))).status,200);
  assert.equal(requests.length,1);
});
