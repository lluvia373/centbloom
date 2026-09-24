import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { loadTypescript } from './load-typescript.mjs';

function harness({secret='server-secret',user='account-a',failed=false,stale=false}={}) {
  const calls=[],fetched=[],exports={};
  const config={status:'configured',url:'https://dev.example',publishableKey:'public-key'};
  const now=new Date().toISOString();
  const quote={symbol:'AAPL',currency:'USD',price:95,quotedAt:stale?'2020-01-01T00:00:00Z':now,fetchedAt:now};
  const {outputText}=ts.transpileModule(readFileSync('src/features/notifications/price-server.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
  const deps={
    '@/features/auth/supabase-config':{validateSupabaseConfiguration:()=>config},
    '@/features/market/server/quote':{fetchQuotes:async symbols=>{fetched.push(symbols);return {quotes:{AAPL:quote},errors:failed?{AAPL:{status:502}}:{}};}},
    '@/features/watchlist/price-alerts':loadTypescript('src/features/watchlist/price-alerts.ts'),
  };
  runInNewContext(outputText,{exports,require:name=>deps[name],URL,AbortSignal,Error,Set,Date,Number,
    process:{env:{SUPABASE_SERVICE_ROLE_KEY:secret}},
    fetch:async(url,options)=>{calls.push({url,options});
      if(url.endsWith('/user'))return {ok:!!user,json:async()=>({id:user})};
      if(url.endsWith('/read_price_alerts'))return {ok:true,json:async()=>[{symbol:'AAPL',enabled:true}]};
      return {ok:true,json:async()=>0};
    },
  });
  return {calls,fetched,run:exports.evaluateAccountPrices};
}
const request=()=>new Request('http://localhost:3000/api/notifications/prices',{method:'POST',headers:{Authorization:'Bearer session'},
  body:JSON.stringify({p_user:'victim',price:1,symbol:'FAKE'})});

test('price server authenticates identity and uses only account conditions plus server quotes, ignoring attacker body',async()=>{
  const h=harness();const result=await h.run(request());
  assert.equal(result.evaluated,1);assert.equal(result.emitted,0);
  assert.deepEqual(Array.from(h.fetched[0]),['AAPL']);
  const write=h.calls.at(-1),body=JSON.parse(write.options.body);
  assert.equal(body.p_user,'account-a');assert.equal(body.p_quotes[0].price,95);assert.equal(body.p_quotes[0].symbol,'AAPL');
  assert.equal(write.options.headers.apikey,'server-secret');
  assert.equal(h.calls[0].options.headers.apikey,'public-key');
});
test('missing auth or server secret and stale/failed provider data cannot write notifications',async()=>{
  const unauthorized=harness({user:null});await assert.rejects(unauthorized.run(request()),error=>error.status===401);
  assert.equal(unauthorized.calls.length,1);
  const noKey=harness({secret:''});await assert.rejects(noKey.run(request()),/시세 확인이 연결되지/);assert.equal(noKey.fetched.length,0);
  for(const setting of [{stale:true},{failed:true}]) {
    const h=harness(setting);const result=await h.run(request());assert.equal(result.unavailable,1);
    assert.ok(h.calls.every(call=>!call.url.endsWith('/evaluate_price_alerts')));
  }
});
