// Isolated SSR presentation check; synthetic facts never enter a user account or app data.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadTypescript } from './load-typescript.mjs';
import { companyFixture } from './fixtures/company-data.mjs';
const names = ['grid', 'section', 'card', 'label', 'amount', 'note'];
const { StockCompanyFacts } = loadTypescript('src/features/market/StockCompanyFacts.tsx', {
  './StockCompanyFacts.module.css': { default: Object.fromEntries(names.map(name => [name, name])) },
});
const css = readFileSync('src/styles/design-tokens.css', 'utf8') + readFileSync('src/features/market/StockCompanyFacts.module.css', 'utf8');
const font = readFileSync('src/assets/fonts/WantedSansVariable.woff2');
createServer((req, res) => {
  if (req.url === '/font.woff2') { res.setHeader('Content-Type', 'font/woff2'); res.end(font); return; }
  const state = new URL(req.url, 'http://localhost').searchParams.get('state') ?? 'received';
  const content = renderToStaticMarkup(createElement(StockCompanyFacts, { snapshot: state === 'unconfigured' ? null : companyFixture(state), asOfDate: '2026-09-24' }));
  res.setHeader('Content-Type', 'text/html;charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
  res.end(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>기업 자료 격리 검사</title><style>${css}
  @font-face{font-family:Wanted;src:url('/font.woff2');font-display:swap}*{box-sizing:border-box}body{margin:0;background:var(--cf-color-canvas);font-family:Wanted,Arial,sans-serif;color:var(--cf-color-ink)}main{max-width:1120px;margin:32px auto;padding:16px}h1{font-size:var(--cf-text-section);font-weight:var(--cf-weight-medium);margin:0 0 24px}p{margin:0}a{color:inherit}
  </style></head><body><main><h1>TEST · 화면 검사 전용 가상 자료</h1>${content}</main></body></html>`);
}).listen(3006, '127.0.0.1', () => console.log('Company data isolated QA: http://127.0.0.1:3006'));
