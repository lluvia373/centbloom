// Local development only. Production uses custom-worker.ts's scheduled handler.
import { setTimeout as pause } from "node:timers/promises";
const watch=process.argv.includes("--watch");
const symbols=process.argv.slice(2).filter(arg=>arg!=="--watch");
if(symbols.some(symbol=>!/^[A-Za-z0-9.^=_-]{1,40}$/.test(symbol)))throw Error("Invalid stock symbol");
async function prepare(symbol) {
 const path="http://localhost:3000/api/news"+(symbol?"?symbol="+encodeURIComponent(symbol.toUpperCase()):"");
 const end=Date.now()+90_000;
 while(Date.now()<end){
  const response=await fetch(path,{signal:AbortSignal.timeout(10_000)});
  if(response.status===200){const feed=await response.json();console.log("News ready:",symbol||"home",feed.stories.length);return;}
  if(response.status!==202)throw Error("News preparation HTTP "+response.status);
  await pause(2_000);
 }
 throw Error("News preparation timed out");
}
do {
 for(const symbol of [undefined,...symbols]){
  try{await prepare(symbol);}catch(error){console.error(error.message);if(watch && error.cause?.code==="ECONNREFUSED")process.exit(0);if(!watch)process.exitCode=1;}
 }
 if(watch)await pause(5*60_000);
} while(watch);
