import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { loadTypescript } from './load-typescript.mjs';

class MarketError extends Error { constructor(message, status=502) { super(message); this.status=status; } }
const quote = symbol => ({symbol, name:symbol, currency:'USD', price:100, fetchedAt:new Date().toISOString()});

function runtime({enabled=false, development=false, binding, read, prepare, next=Date.now()+25_000}={}) {
  const calls={context:0, reads:[], timers:[], prepared:0};
  const engine={
    async read(symbols, signal) { calls.reads.push(symbols); return read ? read(symbols,signal) : {quotes:Object.fromEntries(symbols.map(s=>[s,quote(s)])),errors:{}}; },
    async prepare() { calls.prepared++; return prepare?.(); },
    nextPreparationAt:()=>next,
  };
  const imports={
    '@opennextjs/cloudflare':{getCloudflareContext:async()=>{calls.context++;return {env:{MARKET_PREPARATION_ENABLED:'true',MARKET_QUOTES:binding}};}},
    './prepared-quotes':{createPreparedQuotes:()=>engine},
    './quote-source':{loadPreparationQuotes:()=>{}}, './provider':{MarketError},
  };
  const exports={};
  const source=ts.transpileModule(readFileSync('src/features/market/server/prepared-runtime.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(source,{exports,require:name=>imports[name],process:{env:{NODE_ENV:development?'development':'production',MARKET_PREPARATION_ENABLED:enabled?'true':'false'}},console,Date,
    setTimeout:(run,delay)=>{calls.timers.push({run,delay});return {unref(){}};},clearTimeout:()=>{} });
  return {...exports,calls};
}

test('production preparation defaults off: local public cache, no namespace access or background timer',async()=>{
  const app=runtime();
  assert.equal((await app.readPreparedQuotes(['AAPL'])).quotes.AAPL.price,100);
  assert.equal(app.calls.context,0); assert.equal(app.calls.timers.length,0);
});

test('development prepares after a request without another visitor and does not contact Cloudflare',async()=>{
  const app=runtime({development:true});
  await app.readPreparedQuotes(['AAPL']);
  assert.equal(app.calls.context,0); assert.equal(app.calls.timers.length,1);
  assert.ok(app.calls.timers[0].delay>=1_000);
  await app.calls.timers[0].run();
  assert.equal(app.calls.prepared,1); assert.equal(app.calls.timers.length,2);
});

test('explicitly enabled coordinator uses a public-only request; missing binding fails closed',async()=>{
  const seen=[];
  const binding={idFromName:name=>name,get:(id,options)=>({fetch:async(url,request)=>{seen.push({id,options,url,request});return Response.json({quotes:{AAPL:quote('AAPL')},errors:{}});}})};
  const app=runtime({enabled:true,binding});
  const controller=new AbortController();
  const result=await app.readPreparedQuotes(['AAPL'],controller.signal);
  assert.equal(result.quotes.AAPL.price,100);
  assert.equal(seen[0].id,'public-quotes-v1');
  assert.deepEqual(JSON.parse(seen[0].request.body),{symbols:['AAPL']});
  assert.equal(seen[0].request.signal,controller.signal);
  assert.equal(app.calls.reads.length,0);
  await assert.rejects(runtime({enabled:true}).readPreparedQuotes(['AAPL']),e=>e.status===503);
});

test('coordinator 429 keeps Retry-After and cancellation does not start work',async()=>{
  const binding={idFromName:name=>name,get:()=>({fetch:async()=>new Response('',{status:429,headers:{'Retry-After':'123'}})})};
  const app=runtime({enabled:true,binding});
  await assert.rejects(app.readPreparedQuotes(['AAPL']),e=>e.status===429&&e.retryAfterSeconds===123);
  const cancelled=runtime(); const controller=new AbortController();controller.abort();
  await assert.rejects(cancelled.readPreparedQuotes(['AAPL'],controller.signal),e=>e.name==='AbortError');
  assert.equal(cancelled.calls.reads.length,0);
});

test('single and batch quote facades share the same reader including FX and preserve partial errors',async()=>{
  const seen=[];
  const api=loadTypescript('src/features/market/server/quote.ts',{
    './provider':{MarketError,validSymbol:s=>/^[A-Z0-9.^=_-]{1,40}$/.test(s)},
    './quote-source':{quoteBatchSymbols:s=>s.split(',')},
    './prepared-runtime':{readPreparedQuotes:async symbols=>{seen.push([...symbols]);return {quotes:Object.fromEntries(symbols.filter(s=>s!=='MISSING').map(s=>[s,quote(s)])),errors:symbols.includes('MISSING')?{MISSING:{message:'missing',status:404}}:{}};}},
  });
  assert.equal((await api.fetchQuote(' aapl ')).symbol,'AAPL');
  assert.equal((await api.fetchQuote('USDKRW=X')).symbol,'USDKRW=X');
  assert.equal((await api.fetchQuotes(['AAPL','MISSING'])).errors.MISSING.status,404);
  await assert.rejects(api.fetchQuote('MISSING'),e=>e.status===404);
  assert.deepEqual(seen,[['AAPL'],['USDKRW=X'],['AAPL','MISSING'],['MISSING']]);
});

test('source adapter separates stock batching and FX without dropping currency valuation restrictions',async()=>{
  const batches=[];
  const rate={...quote('USDKRW=X'),currency:'KRW',quotedAt:'2026-09-22T12:00:00Z',fx:{method:'direct',valuationOnly:true,components:[]}};
  const api=loadTypescript('src/features/market/server/quote-source.ts',{
    './provider':{MarketError,validSymbol:s=>/^[A-Z0-9.^=_-]{1,40}$/.test(s),providerRequests:{request:(_key,load,options)=>load(options.signal)},
      yahoo:{quote:async symbols=>{batches.push([...symbols]);return symbols.map(symbol=>({symbol,regularMarketPrice:100,currency:'USD'}));}}},
    './fx-market':{fetchFxQuote:async symbol=>{if(symbol==='CNYKRW=X')throw new MarketError('missing',503);return rate;}},
  });
  const result=await api.loadPreparationQuotes(['AAPL','USDKRW=X','CNYKRW=X'],new AbortController().signal);
  assert.deepEqual(batches,[['AAPL']]);
  assert.equal(result.quotes['USDKRW=X'],rate);
  assert.equal(result.quotes['USDKRW=X'].fx.valuationOnly,true);
  assert.equal(result.errors['CNYKRW=X'].status,503);
  assert.equal(result.quotes['CNYKRW=X'],undefined);
});
