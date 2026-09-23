import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTypescript } from "./load-typescript.mjs";

const Link = ({ children, ...props }) => React.createElement("a", props, children);
const overrides = {
  "next/link": { default: Link },
  "./home.module.css": { default: {} },
  "./reading.module.css": { default: {} },
  "./stock-discovery.module.css": { default: {} },
  "@/features/home/home.module.css": { default: {} },
};

test("community keeps one page title and article links without a self-link or repeated shelf title", () => {
  const { default: ReadingPage } = loadTypescript("src/app/community/page.tsx", overrides);
  const { reading } = loadTypescript("src/features/home/reading.ts");
  const html = renderToStaticMarkup(React.createElement(ReadingPage));
  assert.equal((html.match(/리서치 가이드/g) ?? []).length, 1);
  assert.equal((html.match(/<h1/g) ?? []).length, 1);
  assert.equal((html.match(/<h2/g) ?? []).length, reading.length);
  assert.doesNotMatch(html, /가이드 전체|href="\/community"|투자 판단을 위한 읽을거리|<h3/);
  for (const article of reading) {
    assert.ok(html.includes(`href="/read/${article.slug}"`));
    assert.ok(html.includes(article.title));
    assert.ok(html.includes(article.summary));
  }
});

test("default ReadingShelf keeps its reusable section heading and all-guides link", () => {
  const { ReadingShelf } = loadTypescript("src/features/home/ReadingShelf.tsx", overrides);
  const html = renderToStaticMarkup(React.createElement(ReadingShelf));
  assert.match(html, /리서치 가이드/);
  assert.match(html, /<h2>투자 판단을 위한 읽을거리<\/h2>/);
  assert.match(html, /href="\/community"[^>]*>가이드 전체/);
  assert.equal((html.match(/<h3/g) ?? []).length, 3);
  assert.equal((html.match(/href="\/read\//g) ?? []).length, 3);
});

test("listing article headings inherit the existing token styles and narrow single-column layout", () => {
  const css = readFileSync("src/features/home/reading.module.css", "utf8");
  assert.equal((css.match(/\.readingCard :is\(h2, h3\)/g) ?? []).length, 3);
  assert.match(css, /\.readingCard :is\(h2, h3\)\s*\{\s*font-size: var\(--cf-text-section\)/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.readingGrid\s*\{\s*grid-template-columns: minmax\(0, 1fr\)/);
});

test("global search identifies stock information and still opens stock details", () => {
  let stateIndex = 0;
  const { StockDiscovery } = loadTypescript("src/features/home/StockDiscovery.tsx", {
    ...overrides,
    react: { ...React, useState: () => [["AAPL", true, 0][stateIndex++], () => {}] },
    "@/hooks/useAuth": { useAuth: () => ({ user: null, loading: false }) },
    "@/features/market/use-recent-searches": { useRecentSearches: () => ({ record() {} }) },
    "@/features/market/use-stock-search": { useStockSearch: () => ({ results: [{ symbol: "AAPL", name: "Apple", exchange: "NASDAQ" }], loading: false, error: null }) },
    "@/components/AssetAvatar": { AssetAvatar: () => null },
  });
  const html = renderToStaticMarkup(React.createElement(StockDiscovery));
  assert.match(html, /aria-label="종목 정보 검색"/);
  assert.match(html, /placeholder="종목명·티커로 정보 찾기"/);
  assert.match(html, /href="\/stock\/AAPL"/);
  assert.doesNotMatch(html, />추가<|관심종목에 추가/);
});
