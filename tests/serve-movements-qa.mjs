// Isolated display fixtures only. No login tokens, persistence, real quotes or account writes.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
const root = process.cwd();
const mock = `import React,{createContext,useContext,useState} from 'react';
const Context=createContext({}); export const useAuth=()=>useContext(Context);
const items=Array.from({length:71},(_,i)=>({quote:{symbol:'QA'+i,name:i===0?'아주 긴 회사 이름과 해외 지주회사 Incorporated Class A': '화면 검사 기업 '+i,price:123.45,currency:'USD',changePercent:i%2?4.5:-3.2},sessionDate:'2026-09-24',signals:[{kind:i%3===0?'volume':i%3===1?'price':'reversal',ratio:3,value:i%2?4.5:-3.2,baseline:3}],story:i%4===0?{url:'#article',title:'화면 검사 전용: 이 기사는 실제 뉴스가 아닙니다',publisher:'검사 자료',publishedAt:'2026-09-24T12:00:00Z'}:null}));
export function Provider({children}){const [user,setUser]=useState({id:'qa-A'});return <Context.Provider value={{user,loading:false}}><div className="qa"><p>격리 화면 검사 · 가상 71종목 · 실제 서비스에 저장하지 않음</p><button onClick={()=>setUser(user?null:{id:'qa-A'})}>검사 계정 전환</button></div>{children}</Context.Provider>}
export const useMarketChanges=()=>({data:{access:'full',items,total:items.length},failed:false,retry(){}});
export const useWatchlist=()=>({items:[]});export const useWatchedReports=()=>({});
export const WatchStockButton=({name,className})=><button className={className} aria-label={name+' 관심 저장'}>☆</button>;
export const AssetAvatar=()=>null; export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}`;
const result=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{MarketChangesList}from'./src/features/home/MarketChangesList';import{Provider}from'qa-mock';createRoot(document.getElementById('root')).render(<Provider><main><MarketChangesList/></main></Provider>);`,resolveDir:root,loader:'tsx'},bundle:true,write:false,outfile:'/tmp/centbloom-movements-qa.js',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'display-only',setup(b){
  b.onResolve({filter:/^(qa-mock|next\/link|@\/hooks\/use(Auth|Watchlist)|@\/features\/market\/use-(market-changes|watched-reports)|@\/features\/watchlist\/WatchStockButton|@\/components\/AssetAvatar)$/},()=>({path:'mock',namespace:'qa'}));
  b.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:mock,loader:'tsx',resolveDir:root}));
}}]});
const js=result.outputFiles.find(f=>f.path.endsWith('.js')).contents;
const css=result.outputFiles.find(f=>f.path.endsWith('.css')).text;
const styles=['node_modules/tailwindcss/preflight.css','src/styles/design-tokens.css','src/styles/workspace.css'].map(f=>readFileSync(f,'utf8')).join('\n');
const font=readFileSync('src/assets/fonts/WantedSansVariable.woff2');
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>움직임 화면 검사</title><style>${styles}\n${css}\n@font-face{font-family:Wanted;src:url('/font.woff2')}body{background:var(--cf-color-canvas);color:var(--cf-color-ink);font-family:Wanted,Arial,sans-serif}main{max-width:1120px;margin:24px auto;padding:0 16px}.qa{padding:12px 16px;font-size:12px;background:var(--cf-color-soft)}.qa button{min-height:44px;text-decoration:underline}.sr-only{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}</style><div id="root"></div><script src="/qa.js"></script></html>`;
createServer((req,res)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',req.url==='/qa.js'?'application/javascript':req.url==='/font.woff2'?'font/woff2':'text/html;charset=utf-8');res.end(req.url==='/qa.js'?js:req.url==='/font.woff2'?font:html);}).listen(3007,'127.0.0.1',()=>console.log('Display-only movements QA: http://127.0.0.1:3007'));
