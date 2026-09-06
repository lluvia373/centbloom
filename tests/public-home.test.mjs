import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTypescript } from "./load-typescript.mjs";

test("public read pages render during auth loading while private pages keep the login gate", () => {
  for (const pathname of [
    "/",
    "/discover",
    "/community",
    "/stock/AAPL",
    "/read/read-the-index",
    "/portfolio",
    "/watchlist",
    "/journal",
    "/search",
  ]) {
    const { AuthGate } = loadTypescript("src/components/AuthGate.tsx", {
      "next/navigation": { usePathname: () => pathname },
      "@/hooks/useAuth": {
        useAuth: () => ({ user: null, configured: true, loading: true }),
      },
      "@/app/auth.css": {},
    });
    const html = renderToStaticMarkup(
      createElement(AuthGate, null, createElement("p", null, "PUBLIC_CONTENT")),
    );
    assert.equal(
      html.includes("PUBLIC_CONTENT"),
      [
        "/",
        "/discover",
        "/community",
        "/stock/AAPL",
        "/read/read-the-index",
      ].includes(pathname),
      pathname,
    );
  }
  const { isPublicRoute } = loadTypescript(
    "src/features/auth/public-routes.ts",
  );
  for (const path of [
    "/portfolio/anything",
    "/stock/AAPL/edit",
    "/read/slug/private",
    "/search",
  ])
    assert.equal(isPublicRoute(path), false);
});

test("news rejects unsafe links, malformed dates, future and stale articles; deduplicates and sorts", () => {
  const { normalizeNews } = loadTypescript("src/features/market/news-model.ts");
  const now = Date.parse("2026-09-06T00:00:00Z");
  const base = {
    uuid: "one",
    title: "Market headline",
    publisher: "Publisher",
    link: "https://example.com/one",
    providerPublishTime: "2026-09-05T00:00:00Z",
    relatedTickers: ["AAPL", "<script>"],
  };
  const result = normalizeNews(
    [
      base,
      base,
      { ...base, link: "javascript:alert(1)" },
      {
        ...base,
        link: "https://example.com/two",
        providerPublishTime: "2026-09-05T22:00:00Z",
      },
      {
        ...base,
        link: "https://example.com/stale",
        providerPublishTime: "2026-08-01T00:00:00Z",
      },
      {
        ...base,
        link: "https://example.com/future",
        providerPublishTime: "2027-01-01T00:00:00Z",
      },
    ],
    now,
  );
  assert.equal(result.length, 2);
  assert.equal(result[0].url, "https://example.com/two");
  assert.deepEqual(Array.from(result[1].symbols), ["AAPL"]);
});

test("editorial calendar expires past events instead of recycling their dates", () => {
  const { upcomingEvents } = loadTypescript("src/features/home/calendar.ts");
  assert.equal(upcomingEvents(Date.parse("2026-09-06T00:00:00Z")).length, 3);
  assert.equal(upcomingEvents(Date.parse("2026-09-11T12:30:01Z")).length, 1);
  assert.equal(upcomingEvents(Date.parse("2026-10-01T00:00:00Z")).length, 0);
});

test("watch action never enables guest writes when authentication is configured", () => {
  let writes = 0;
  const { WatchStockButton } = loadTypescript(
    "src/features/watchlist/WatchStockButton.tsx",
    {
      "@/hooks/useAuth": {
        useAuth: () => ({ user: null, configured: true, loading: false }),
      },
      "@/hooks/useWatchlist": {
        useWatchlist: () => ({
          items: [],
          ready: true,
          addItem: () => writes++,
        }),
      },
    },
  );
  const html = renderToStaticMarkup(
    createElement(WatchStockButton, { symbol: "AAPL", name: "Apple" }),
  );
  assert.match(html, /로그인하고 관심종목 저장/);
  assert.doesNotMatch(html, /<button/);
  assert.equal(writes, 0);
});
