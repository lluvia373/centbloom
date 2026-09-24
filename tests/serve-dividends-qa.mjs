import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const result=await build({entryPoints:['tests/fixtures/dividends-browser.tsx'],bundle:true,write:false,outfile:'/tmp/centbloom-dividends-qa.js',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}});
const js=result.outputFiles.find(f=>f.path.endsWith('.js')).contents;
const css=result.outputFiles.find(f=>f.path.endsWith('.css')).text;
const tokens=readFileSync('src/styles/design-tokens.css','utf8');
const font=readFileSync('src/assets/fonts/WantedSansVariable.woff2');
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>배당 격리 검사</title><style>
${tokens}\n${css}
@font-face{font-family:Wanted;src:url('/font.woff2');font-display:swap}*{box-sizing:border-box}body{margin:0;background:var(--cf-color-canvas);font-family:Wanted,Arial,sans-serif;color:var(--cf-color-ink)}main{max-width:1120px;margin:32px auto;padding:16px}p,h2{margin:0}main>p,output{display:block;margin-bottom:16px;font-size:13px}select{min-height:44px;font:inherit}.card{background:var(--cf-color-surface);padding:24px;border:1px solid var(--cf-color-line);border-radius:var(--cf-radius-card)}@media(max-width:600px){.card{padding:16px}}
</style><div id="root"></div><script src="/qa.js"></script></html>`;
createServer((req,res)=>{
  if (/^\/data\/dividends\/(?:manifest|[a-f0-9]{64})\.json$/.test(req.url ?? '')) {
    try { res.setHeader('Content-Type','application/json'); res.end(readFileSync(`public${req.url}`)); }
    catch { res.writeHead(404).end(); }
    return;
  }
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type',req.url==='/qa.js'?'application/javascript':req.url==='/font.woff2'?'font/woff2':'text/html;charset=utf-8');
  res.end(req.url==='/qa.js'?js:req.url==='/font.woff2'?font:html);
}).listen(3005,'127.0.0.1',()=>console.log('Dividend isolated QA: http://127.0.0.1:3005'));
