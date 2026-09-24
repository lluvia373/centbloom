// Isolated UI harness: memory-only real ledger, no account, quotes, trades or notifications.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const result = await build({
  entryPoints: ['tests/fixtures/portfolio-alerts-browser.tsx'], bundle: true, write: false,
  outfile: '/tmp/centbloom-portfolio-alerts-qa.js', format: 'iife', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"', 'process.env.NEXT_PUBLIC_SUPABASE_URL': '""', 'process.env.NEXT_PUBLIC_SUPABASE_DEV_PROJECT_REF': '""', 'process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY': '""' },
  plugins: [{ name: 'isolated-ledger', setup(b) {
    b.onResolve({ filter: /^@\/hooks\/useAuth$/ }, () => ({ path: 'auth', namespace: 'qa' }));
    b.onResolve({ filter: /^@\/hooks\/usePortfolio$/ }, () => ({ path: 'hooks', namespace: 'qa' }));
    b.onResolve({ filter: /^@\/lib\/supabase$/ }, args => args.importer.endsWith('/state/ledger.tsx') ? { path: 'supabase', namespace: 'qa' } : undefined);
    b.onResolve({ filter: /^\.\.\/data\/local$/ }, () => ({ path: 'storage', namespace: 'qa' }));
    b.onLoad({ filter: /.*/, namespace: 'qa' }, args => ({ loader: 'js', resolveDir: root, contents:
      args.path === 'auth' ? 'export const useAuth=()=>({user:null});'
      : args.path === 'supabase' ? 'export const getSupabaseBrowserClient=()=>null;'
      : args.path === 'hooks' ? `export {usePortfolios,useTransactions,useAllTransactions} from ${JSON.stringify(resolve(root,'src/features/portfolio/state/ledger.tsx'))};`
      : `import {localRepository as original} from ${JSON.stringify(resolve(root,'src/features/portfolio/data/local.ts'))};
         const data=new Map(); const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
         export const localRepository=()=>original(storage,null); export const transactionCache=()=>{throw new Error('No account cache in QA')};`
    }));
  } }],
});
const js = result.outputFiles.find(file => file.path.endsWith('.js')).contents;
const css = result.outputFiles.find(file => file.path.endsWith('.css')).text;
const tokens = readFileSync('src/styles/design-tokens.css', 'utf8');
const preflight = readFileSync('node_modules/tailwindcss/preflight.css', 'utf8');
const workspace = readFileSync('src/styles/workspace.css', 'utf8');
const font = readFileSync('src/assets/fonts/WantedSansVariable.woff2');
const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Centbloom 격리 화면 검사</title><style>
${preflight}\n${tokens}\n${workspace}\n${css}
@font-face{font-family:Wanted;src:url('/font.woff2')}*{box-sizing:border-box}body{margin:0;background:var(--cf-color-canvas);font-family:Wanted,Arial,sans-serif;color:var(--cf-color-ink)}button,input,select{font:inherit}button{cursor:pointer}ul{margin:0;padding:0;list-style:none}h1,h2,p{margin:0}h2{font-size:var(--cf-text-section);margin-bottom:var(--cf-space-4)}main{max-width:1120px;margin:32px auto;padding:0 16px}.qa-note{font-size:var(--cf-text-caption);color:var(--cf-color-muted);margin-bottom:var(--cf-space-6)}.qa-card{background:var(--cf-color-surface);border:1px solid var(--cf-color-line);border-radius:var(--cf-radius-card);padding:var(--cf-space-6);margin-top:var(--cf-space-4)}@media(max-width:600px){.qa-card{padding:var(--cf-space-4)}}
</style><div id="root"></div><script src="/qa.js"></script></html>`;
const server = createServer((req, res) => {
  res.setHeader('Cache-Control','no-store');
  const path = req.url;
  res.setHeader('Content-Type', path === '/qa.js' ? 'application/javascript' : path === '/font.woff2' ? 'font/woff2' : 'text/html;charset=utf-8');
  res.end(path === '/qa.js' ? js : path === '/font.woff2' ? font : html);
});
server.listen(3002, '127.0.0.1', () => console.log('Memory-only portfolio/alerts QA ready: http://127.0.0.1:3002'));
