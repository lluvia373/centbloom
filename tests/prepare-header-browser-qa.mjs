// Run: node tests/prepare-header-browser-qa.mjs
// Reuses the actual UI with in-memory auth/inbox aliases. No Next route, DB,
// browser storage, external requests, or installed dependency changes.
import { context } from "esbuild";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = join(root, "tests/fixtures/header-browser-fixture.tsx");
const outdir = await mkdtemp(join(tmpdir(), "centbloom-header-qa-"));
const build = await context({
  absWorkingDir: root, entryPoints: [fixture], outfile: join(outdir, "fixture.js"),
  bundle: true, jsx: "automatic", format: "esm", platform: "browser", sourcemap: true,
  alias: { "next/link": fixture, "@/hooks/useAuth": fixture, "@/features/notifications/NotificationProvider": fixture },
  define: { "process.env.NODE_ENV": '"development"' }, logLevel: "warning",
});
await build.rebuild();
await build.watch();
await copyFile(join(root, "src/assets/fonts/WantedSansVariable.woff2"), join(outdir, "wanted-sans.woff2"));
await writeFile(join(outdir, "index.html"), `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Centbloom 격리 헤더 검증</title><link rel="stylesheet" href="/fixture.css"><style>
@font-face{font-family:WantedSans;src:url('/wanted-sans.woff2') format('woff2');font-weight:100 900;font-display:swap}
:root{--font-wanted-sans:WantedSans;--sidebar-width:236px;color-scheme:light}*{box-sizing:border-box}body{margin:0;font-family:var(--cf-font-ui);font-size:var(--cf-text-body);background:var(--cf-color-canvas);color:var(--cf-color-ink);-webkit-font-smoothing:antialiased}button,input,select{font:inherit;color:inherit}button{border:0;background:none;cursor:pointer}a{color:inherit;text-decoration:none}p,h1{margin:0}button:disabled{cursor:wait}.qa-banner{position:relative;z-index:60;display:flex;flex-wrap:wrap;gap:var(--cf-space-2);padding:var(--cf-space-2) var(--cf-space-4);background:var(--cf-color-warning-soft);font-size:var(--cf-text-caption);line-height:var(--cf-leading-body);color:var(--cf-color-warning)}.qa-sidebar{position:fixed;top:60px;left:0;width:var(--sidebar-width);display:grid;gap:var(--cf-space-6);padding:var(--cf-space-6)}.qa-sidebar strong{font-size:var(--cf-text-title)}.qa-search{display:flex;align-items:center;gap:var(--cf-space-2);height:44px;border:1px solid var(--cf-color-line);border-radius:var(--cf-radius-control);background:var(--cf-color-surface);padding:0 var(--cf-space-3);color:var(--cf-color-muted)}.qa-search input{width:100%;min-width:0;border:0;outline:0;background:transparent;font-size:var(--cf-text-label)}.qa-search:focus-within{outline:2px solid var(--cf-color-focus);outline-offset:2px}.qa-search svg{flex:none}.qa-main{margin-left:var(--sidebar-width);padding:var(--cf-space-6)}.qa-card{max-width:var(--cf-page-content-width);margin-inline:auto;padding:var(--cf-space-6);background:var(--cf-color-surface);border:1px solid var(--cf-color-line);border-radius:var(--cf-radius-card);display:grid;gap:var(--cf-space-4)}.qa-card h1{font-size:var(--cf-text-section)}.qa-card p{font-size:var(--cf-text-label);line-height:var(--cf-leading-body);color:var(--cf-color-muted)}.qa-state{display:flex;align-items:center;flex-wrap:wrap;gap:var(--cf-space-3);font-size:var(--cf-text-label)}.qa-state select{min-height:44px;max-width:100%;padding:var(--cf-space-2);border:1px solid var(--cf-color-line);border-radius:var(--cf-radius-control);background:var(--cf-color-surface)}.qa-action{overflow-wrap:anywhere}@media(max-width:760px){.qa-sidebar{display:none}.qa-main{margin-left:0;padding:var(--cf-space-4)}.qa-card{padding:var(--cf-space-4)}}
</style><div id="root"></div><script type="module" src="/fixture.js"></script></html>`);
const assets = new Map([["/", ["index.html", "text/html; charset=utf-8"]], ["/fixture.js", ["fixture.js", "text/javascript; charset=utf-8"]], ["/fixture.css", ["fixture.css", "text/css; charset=utf-8"]], ["/wanted-sans.woff2", ["wanted-sans.woff2", "font/woff2"]]]);
const server = createServer(async (request, response) => {
  const asset = assets.get(new URL(request.url, "http://127.0.0.1:3004").pathname);
  if (!asset) { response.writeHead(404); response.end("Not found"); return; }
  try { const body = await readFile(join(outdir, asset[0])); response.writeHead(200, { "Content-Type": asset[1], "Cache-Control": "no-store" }); response.end(body); }
  catch { response.writeHead(500); response.end("Fixture not ready"); }
});
server.listen(3004, "127.0.0.1", () => console.log(`Isolated header QA: http://127.0.0.1:3004/\nGenerated assets: ${outdir}\nUI changes rebuild automatically; reload the browser after edits.\nOnly mock state; no account, storage or network data access.`));
server.on("error", async error => { console.error(error.message); await build.dispose(); process.exitCode = 1; });
const stop = () => { server.close(); void build.dispose().then(() => process.exit()); };
process.once("SIGINT", stop); process.once("SIGTERM", stop);
