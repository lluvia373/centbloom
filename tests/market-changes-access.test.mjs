import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTypescript } from "./load-typescript.mjs";

const make = (index) => ({ quote: { symbol: `T${index}`, name: `Company ${index}`, price: 100, change: 4, changePercent: 4,
  currency: "USD", quotedAt: new Date().toISOString() }, sessionDate: "2026-09-24",
  signals: [{ kind: "volume", value: 300, baseline: 100, ratio: 3 }], story: null });
const items = Array.from({ length: 71 }, (_, index) => make(index));
const feed = { items, examined: 300, historyUnavailable: 0, partial: false, expiresAt: Date.now() + 60000 };
const { changesView } = loadTypescript("src/features/market/change-research.ts");

test("public responses contain only three actual items; full responses have no result cap", () => {
  const preview = changesView(feed);
  assert.equal(preview.access, "preview");
  assert.equal(preview.items.length, 3);
  assert.equal(preview.total, 71);
  assert.equal(changesView(feed, true).items.length, 71);
});

test("full endpoint authenticates before reading; public query filters cannot reveal another preview", async () => {
  let reads = 0, auth = 0;
  class MarketError extends Error { constructor(message, status) { super(message); this.status = status; } }
  const { GET } = loadTypescript("src/app/api/market-changes/route.ts", {
    "@/features/market/server/changes-response": { readPreparedChanges: async () => { reads++; return feed; } },
    "@/features/market/server/changes-access": { requireChangesMember: async req => { auth++; if (req.headers.get("authorization") !== "Bearer verified") throw new MarketError("login", 401); } },
    "@/features/market/server/http": { marketResponseError: error => Response.json({ error: error.message }, { status: error.status }) },
  });
  for (const query of ["", "?page=2", "?kind=price&limit=750", "?scope=full"]) {
    const response = await GET(new Request("http://localhost:3000/api/market-changes" + query));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).items.length, 3);
  }
  const prior = reads;
  for (const headers of [{}, { Authorization: "Bearer forged" }]) {
    const response = await GET(new Request("http://localhost:3000/api/market-changes?scope=all", { headers }));
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
  assert.equal(reads, prior);
  const response = await GET(new Request("http://localhost:3000/api/market-changes?scope=all", { headers: { Authorization: "Bearer verified" } }));
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("vary"), "Authorization");
  assert.equal((await response.json()).items.length, 71);
  assert.equal(auth, 3);
});

test("server validation uses the configured auth server and rejects invalid or anonymous users", async () => {
  const original = globalThis.fetch;
  const calls = [];
  let response = Response.json({ id: "member" });
  class MarketError extends Error { constructor(message, status) { super(message); this.status = status; } }
  const { requireChangesMember } = loadTypescript("src/features/market/server/changes-access.ts", {
    "./provider": { MarketError },
    "@/features/auth/supabase-config": { validateSupabaseConfiguration: () => ({ status: "configured", url: "https://test.supabase.co", publishableKey: "public-test-key" }) },
  });
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return response; };
  const request = new Request("http://localhost:3000/api/market-changes?scope=all", { headers: { Authorization: "Bearer test-token" } });
  try {
    await requireChangesMember(request);
    assert.equal(calls[0].url, "https://test.supabase.co/auth/v1/user");
    assert.equal(calls[0].options.cache, "no-store");
    for (const invalid of [Response.json({}, { status: 401 }), Response.json({ id: "anonymous", is_anonymous: true }), Response.json({})]) {
      response = invalid;
      await assert.rejects(requireChangesMember(request), error => error.status === 401);
    }
  } finally { globalThis.fetch = original; }
});

test("a late full response is discarded after account change; JWT rejection retries only once", async () => {
  const original = globalThis.fetch;
  let owner = "A", refreshes = 0, calls = 0, switchAccount = true;
  const client = { auth: {
    getSession: async () => ({ data: { session: owner ? { user: { id: owner }, access_token: "token" + refreshes } : null }, error: null }),
    refreshSession: async () => { refreshes++; return { error: null }; },
  } };
  const { requestMarketChanges } = loadTypescript("src/features/market/use-market-changes.ts", {
    "@/lib/supabase": { getSupabaseBrowserClient: () => client },
  });
  globalThis.fetch = async () => { calls++; if (switchAccount) owner = "B"; return Response.json(changesView(feed, true), { status: switchAccount || calls > 1 ? 200 : 401 }); };
  try {
    await assert.rejects(requestMarketChanges("A", new AbortController().signal), /계정이 변경/);
    owner = "A"; calls = 0; switchAccount = false;
    assert.equal((await requestMarketChanges("A", new AbortController().signal)).items.length, 71);
    assert.equal(refreshes, 1); assert.equal(calls, 2);
    owner = null;
    await assert.rejects(requestMarketChanges("A", new AbortController().signal), /계정이 변경/);
  } finally { globalThis.fetch = original; }
});

test("member directory pages all results, searches names/tickers, distinguishes no results and never renders full data for guests", () => {
  const css = new Proxy({}, { get: (_, name) => String(name) });
  function render({ user = { id: "member" }, query = "", kind, page = 0, data = changesView(feed, true) } = {}) {
    let index = 0; const state = [query, kind, page];
    const { MarketChangesList } = loadTypescript("src/features/home/MarketChangesList.tsx", {
      react: { ...React, useState: () => [state[index++], () => {}] },
      "@/hooks/useAuth": { useAuth: () => ({ user, loading: false }) },
      "@/hooks/useWatchlist": { useWatchlist: () => ({ items: [] }) },
      "@/features/market/use-market-changes": { useMarketChanges: () => ({ data, failed: false }) },
      "@/features/market/use-watched-reports": { useWatchedReports: () => ({}) },
      "./MarketChangeCard": { MarketChangeCard: ({ item }) => React.createElement("article", null, item.quote.symbol) },
      "./market-changes.module.css": { default: css },
    });
    return renderToStaticMarkup(React.createElement(MarketChangesList));
  }
  assert.equal((render().match(/<article>/g) ?? []).length, 20);
  assert.equal((render({ page: 3 }).match(/<article>/g) ?? []).length, 11);
  assert.match(render({ query: "Company 70" }), /<article>T70<\/article>/);
  assert.match(render({ query: "not-found" }), /검색 조건에 맞는 종목이 없어요/);
  assert.match(render({ query: "not-found" }), /조건 지우기/);
  assert.doesNotMatch(render({ user: null }), /<article>/);
  assert.doesNotMatch(render({ data: changesView(feed) }), /<article>/);
  assert.match(render({ data: changesView({ ...feed, items: [] }, true) }), /현재 확인된 특이 움직임이 없습니다/);
});

test("the full-list route is private and login return allows only its safe internal path", () => {
  const { isPublicRoute } = loadTypescript("src/features/auth/public-routes.ts");
  const { safeReturnPath } = loadTypescript("src/features/auth/login-return.ts");
  const { navigationArea, navigationPageName } = loadTypescript("src/features/navigation/model.ts");
  assert.equal(navigationArea("/movements"), "market");
  assert.equal(navigationPageName("/movements"), "평소와 다른 움직임");
  assert.equal(isPublicRoute("/movements"), false);
  assert.equal(safeReturnPath("/movements?token=do-not-store"), "/movements");
});
