import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTypescript } from "./load-typescript.mjs";

function renderRail(pathname, enabled) {
  const { SideRailPreview } = loadTypescript("src/features/ads/SideRailPreview.tsx", {
    "next/navigation": { usePathname: () => pathname },
    "./preview-mode": { adPreviewEnabled: enabled },
    "./side-rail.module.css": { default: {} },
  });
  return renderToStaticMarkup(createElement(SideRailPreview, { side: "left" }));
}

test("side rail previews remain absent from personal and authentication routes", () => {
  for (const path of ["/portfolio", "/insights", "/transactions", "/journal", "/watchlist", "/settings", "/search", "/login"]) {
    assert.equal(renderRail(path, true), "", path);
  }
  for (const path of ["/", "/discover", "/stock/AAPL", "/calendar", "/calendar/cpi", "/read/read-the-index"]) {
    assert.match(renderRail(path, true), /data-ad-side="left"/, path);
  }
});

test("disabled previews render no dummy inventory, ad scripts or tracking requests", () => {
  assert.equal(renderRail("/", false), "");
  const { AdSlot } = loadTypescript("src/features/ads/AdSlot.tsx", {
    "./preview-mode": { adPreviewEnabled: false },
    "./ads.module.css": { default: {} },
  });
  assert.equal(renderToStaticMarkup(createElement(AdSlot, { placement: "home-top" })), "");
  assert.doesNotMatch(renderRail("/", true), /<script|<iframe|<ins|adsbygoogle/);
});

test("shared page frame keeps a single skip-link destination and page content", () => {
  const { PageFrame } = loadTypescript("src/components/PageFrame.tsx", {
    "@/features/ads": { SideRailPreview: () => null },
    "./PageFrame.module.css": { default: {} },
  });
  const html = renderToStaticMarkup(createElement(PageFrame, null, createElement("h1", null, "보유자산")));
  assert.equal((html.match(/<main/g) ?? []).length, 1);
  assert.match(html, /id="main-content"/);
  assert.match(html, /<h1>보유자산<\/h1>/);
});
