import test from "node:test";
import assert from "node:assert/strict";
import { loadTypescript } from "./load-typescript.mjs";
const { usableNews, NEWS_MAX_AGE_MS, newsKey } = loadTypescript("src/features/market/server/prepared-news.ts");
const story = { id:"one",title:"Apple reports results",titleKo:"애플이 실적을 발표했습니다",url:"https://example.com/apple",publisher:"Source",publishedAt:new Date().toISOString(),symbols:["AAPL"] };
const snapshot = (age=0) => ({version:1,preparedAt:Date.now()-age,feed:{stories:[story],partial:false}});
function memoryKV(initial=[]) {
 const values=new Map(initial);
 return {values,get:async(key,type)=>{const v=values.get(key)??null;return v&&type==="json"?JSON.parse(v):v;},put:async(key,v)=>{values.set(key,v);},list:async()=>({keys:[],list_complete:true})};
}
test("prepared news rejects expired/wrong-symbol/unsafe data without inventing an empty result",()=>{
 assert.equal(usableNews(snapshot(NEWS_MAX_AGE_MS+1000)),null);
 assert.equal(usableNews(snapshot(),"MSFT"),null);
 const bad=snapshot();bad.feed.stories=[{...story,url:"javascript:alert(1)"}];
 assert.equal(usableNews(bad),null);
 assert.equal(usableNews(snapshot()).feed.stories[0].titleKo,story.titleKo);
 assert.equal(usableNews(snapshot(11*60_000)).feed.stale,true);
});
test("cache miss schedules collection after response; a blocked collector cannot block the read",async()=>{
 const callbacks=[];let started=0;
 const {readPreparedNews}=loadTypescript("src/features/market/server/news-response.ts",{
  "react":{cache:fn=>fn},"next/server":{connection:async()=>{},after:fn=>callbacks.push(fn)},
  "@opennextjs/cloudflare":{getCloudflareContext:async()=>({env:{NEWS_CACHE:memoryKV()}})},
  "./news-refresh":{refreshPreparedNews:()=>{started++;return new Promise(()=>{});}},
  "./provider":{validSymbol:()=>true},
 });
 assert.equal(await readPreparedNews(),null);assert.equal(started,0);assert.equal(callbacks.length,1);
});
test("a prepared feed returns immediately and fresh data does not schedule collection",async()=>{
 let scheduled=0;
 const {readPreparedNews}=loadTypescript("src/features/market/server/news-response.ts",{
  "react":{cache:fn=>fn},"next/server":{connection:async()=>{},after:()=>scheduled++},
  "@opennextjs/cloudflare":{getCloudflareContext:async()=>({env:{NEWS_CACHE:memoryKV([[newsKey(),JSON.stringify(snapshot())]])}})},
  "./news-refresh":{refreshPreparedNews:async()=>{throw Error("must not fetch");}},"./provider":{validSymbol:()=>true},
 });
 assert.equal((await readPreparedNews()).stories.length,1);assert.equal(scheduled,0);
});
test("failed collection preserves the prior snapshot and backs off",async()=>{
 const prior=JSON.stringify(snapshot(6*60_000));const kv=memoryKV([[newsKey(),prior]]);let calls=0;
 const {refreshPreparedNews}=loadTypescript("src/features/market/server/news-refresh.ts",{
  "./trending-news":{fetchTrendingNews:async()=>{calls++;throw Error("upstream unavailable");}},
  "./news":{fetchNews:async()=>[]},"./translation-provider":{createNewsTitleTranslator:()=>async stories=>stories},
 });
 await assert.rejects(refreshPreparedNews({NEWS_CACHE:kv,NEWS_AI:{}}));
 assert.equal(kv.values.get(newsKey()),prior);
 await refreshPreparedNews({NEWS_CACHE:kv,NEWS_AI:{}});assert.equal(calls,1);
});
test("initial HTML seed survives a failed client refresh",async()=>{
 const {createPollingStore}=loadTypescript("src/shared/async/polling-store.ts");
 const store=createPollingStore(async()=>{throw Error("offline");});
 const seed={stories:[story],partial:false};const stop=store.subscribe("trending",()=>{},seed);
 try{await new Promise(resolve=>setTimeout(resolve,0));assert.equal(store.snapshot("trending").data,seed);assert.equal(store.snapshot("trending").failed,true);}finally{stop();}
});

test("scheduled refresh replaces even a recently prepared feed without keeping demand alive",async()=>{
 const kv=memoryKV([[newsKey(),JSON.stringify(snapshot())]]);let calls=0;
 const {refreshScheduledNews}=loadTypescript("src/features/market/server/news-refresh.ts",{
  "./trending-news":{fetchTrendingNews:async()=>{calls++;return {stories:[story],partial:false};}},
  "./news":{fetchNews:async()=>[]},"./translation-provider":{createNewsTitleTranslator:()=>async stories=>stories},
 });
 await refreshScheduledNews({NEWS_CACHE:kv,NEWS_AI:{}});assert.equal(calls,1);
 assert.equal([...kv.values.keys()].some(k=>k.startsWith("news-demand:")),false);
});

test("fresh stock visits renew demand without collecting again or writing every visit",async()=>{
 const kv=memoryKV([[newsKey("AAPL"),JSON.stringify(snapshot())]]);let writes=0;
 const put=kv.put;kv.put=async(...args)=>{writes++;await put(...args);};
 const overrides={"./news":{fetchNews:async()=>{throw Error("fresh data must not fetch");}},"./trending-news":{fetchTrendingNews:async()=>{throw Error("wrong feed");}},"./translation-provider":{createNewsTitleTranslator:()=>async stories=>stories}};
 await loadTypescript("src/features/market/server/news-refresh.ts",overrides).refreshPreparedNews({NEWS_CACHE:kv},"AAPL",{recordDemand:true});
 assert.ok(Number(kv.values.get("news-demand:AAPL"))>Date.now()-1000);assert.equal(writes,1);
 await loadTypescript("src/features/market/server/news-refresh.ts",overrides).refreshPreparedNews({NEWS_CACHE:kv},"AAPL",{recordDemand:true});assert.equal(writes,1);
});
test("collection timeout preserves existing news, records failure and permits later recovery",async()=>{
 const prior=JSON.stringify(snapshot(6*60_000));const kv=memoryKV([[newsKey(),prior]]);let fail=true;
 const {refreshPreparedNews}=loadTypescript("src/features/market/server/news-refresh.ts",{
  "./news":{fetchNews:async()=>[]},"./translation-provider":{createNewsTitleTranslator:()=>async stories=>stories},
  "./trending-news":{fetchTrendingNews:async(signal)=>{if(!fail)return {stories:[{...story,title:"Apple announces new results"}],partial:false};await new Promise((resolve,reject)=>signal.addEventListener("abort",()=>reject(signal.reason),{once:true}));}},
 });
 await assert.rejects(refreshPreparedNews({NEWS_CACHE:kv},undefined,{timeoutMs:20}),{name:"TimeoutError"});
 await new Promise(resolve=>setTimeout(resolve,0));assert.equal(kv.values.get(newsKey()),prior);assert.ok(kv.values.has("news-failure:"+newsKey()));
 kv.values.delete("news-failure:"+newsKey());fail=false;
 await refreshPreparedNews({NEWS_CACHE:kv});assert.equal(JSON.parse(kv.values.get(newsKey())).feed.stories[0].title,"Apple announces new results");
});
test("fresh stock response schedules demand tracking without delaying the feed",async()=>{
 const callbacks=[];
 const {readPreparedNews}=loadTypescript("src/features/market/server/news-response.ts",{
  "react":{cache:fn=>fn},"next/server":{connection:async()=>{},after:fn=>callbacks.push(fn)},
  "@opennextjs/cloudflare":{getCloudflareContext:async()=>({env:{NEWS_CACHE:memoryKV([[newsKey("AAPL"),JSON.stringify(snapshot())]])}})},
  "./news-refresh":{refreshPreparedNews:async()=>{}},"./provider":{validSymbol:()=>true},
 });
 assert.equal((await readPreparedNews("AAPL")).stories.length,1);assert.equal(callbacks.length,1);
});
