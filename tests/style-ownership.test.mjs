import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { loadTypescript } from "./load-typescript.mjs";

const requireNext = createRequire(import.meta.resolve("next/package.json"));
const postcss = requireNext("postcss");
const localByDefault = requireNext("next/dist/compiled/postcss-modules-local-by-default");
const extractImports = requireNext("next/dist/compiled/postcss-modules-extract-imports");
const scope = requireNext("next/dist/compiled/postcss-modules-scope");
const values = requireNext("next/dist/compiled/postcss-modules-values");
const ownedModules = new Set([
  "src/components/AssetAvatar.module.css",
  "src/features/home/market-changes.module.css",
  "src/features/home/stock-discovery.module.css",
  "src/features/home/reading.module.css",
]);
const consumers = [
  "src/components/AssetAvatar.tsx",
  "src/features/home/MarketChanges.tsx",
  "src/features/home/StockDiscovery.tsx",
  "src/features/home/ReadingShelf.tsx",
  "src/app/read/[slug]/page.tsx",
];
const source = path => readFileSync(path, "utf8");
const classes = path => {
  const names = new Set();
  postcss.parse(source(path)).walkRules(rule => {
    for (const match of rule.selector.matchAll(/\.([\w-]+)/g)) names.add(match[1]);
  });
  return names;
};

test("owned modules pass Next CSS Modules purity and scoped export compilation", async () => {
  for (const file of ownedModules) {
    const compiled = await postcss([
      values(), localByDefault({ mode: "pure" }), extractImports(),
      scope({ generateScopedName: name => "owned_" + name }),
    ]).process(source(file), { from: file });
    const exported = new Set();
    compiled.root.walkRules(":export", rule => {
      rule.walkDecls(decl => {
        exported.add(decl.prop);
        assert.equal(decl.value, "owned_" + decl.prop);
      });
    });
    assert.deepEqual(exported, classes(file));
    assert.equal(compiled.warnings().length, 0);
  }
});

test("screen-owned CSS exports cover every direct and computed consumer reference", () => {
  const seen = new Set();
  for (const file of consumers) {
    const tree = ts.createSourceFile(file, source(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const imports = new Map();
    for (const node of tree.statements) {
      if (!ts.isImportDeclaration(node) || !node.importClause?.name) continue;
      const specifier = node.moduleSpecifier.text;
      const path = specifier.startsWith("@/") ? "src/" + specifier.slice(2)
        : join(dirname(file), specifier);
      if (ownedModules.has(path)) {
        imports.set(node.importClause.name.text, classes(path));
        seen.add(path);
      }
    }
    function visit(node) {
      if ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
        && ts.isIdentifier(node.expression) && imports.has(node.expression.text)) {
        const key = ts.isPropertyAccessExpression(node) ? node.name.text
          : ts.isStringLiteralLike(node.argumentExpression) ? node.argumentExpression.text : null;
        assert.ok(key, `${file}: dynamic CSS keys need an explicit supported-key test`);
        assert.ok(imports.get(node.expression.text).has(key), `${file}: missing CSS class ${key}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(tree);
  }
  assert.deepEqual(seen, ownedModules);
});

test("asset marks and empty holdings use scoped styles in both sizes", () => {
  const { AssetAvatar, EmptyPortfolio } = loadTypescript("src/components/AssetAvatar.tsx", {
    "@/lib/company-logos": { companyLogoSources: () => [] },
    "./AssetAvatar.module.css": { default: new Proxy({}, { get: (_, key) => "avatar-" + String(key) }) },
  });
  for (const small of [false, true]) {
    const html = renderToStaticMarkup(React.createElement(AssetAvatar, { symbol: "AAPL", small }));
    assert.match(html, /class="avatar-asset-avatar /);
    assert.match(html, /aria-hidden="true"/);
    assert.equal(html.includes("avatar-asset-avatar-small"), small);
  }
  for (const compact of [false, true]) {
    const html = renderToStaticMarkup(React.createElement(EmptyPortfolio, { compact }));
    assert.match(html, /avatar-empty-portfolio/);
    assert.match(html, /avatar-empty-icon/);
    assert.match(html, /보유종목 없음/);
    assert.equal(html.includes("avatar-compact"), compact);
  }
});

test("article eyebrow keeps shared typography and article-specific spacing together", async () => {
  const { reading } = loadTypescript("src/features/home/reading.ts");
  const { default: ReadingPage } = loadTypescript("src/app/read/[slug]/page.tsx", {
    "@/features/ads": { AdSlot: () => null },
    "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
    "@/features/home/home.module.css": { default: new Proxy({}, { get: (_, key) => "shared-" + String(key) }) },
    "@/features/home/reading.module.css": { default: new Proxy({}, { get: (_, key) => "reading-" + String(key) }) },
  });
  const html = renderToStaticMarkup(await ReadingPage({ params: Promise.resolve({ slug: reading[0].slug }) }));
  assert.match(html, /class="shared-eyebrow reading-eyebrow"/);
  assert.match(html, /class="reading-article"/);
  assert.match(html, /class="shared-textLink"/);
});

test("removed date and notification components have no source consumers or orphan styles", () => {
  assert.equal(existsSync("src/components/WorkspaceDate.tsx"), false);
  assert.equal(existsSync("src/features/market/MarketNotification.tsx"), false);
  function scan(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) scan(file);
      else if (/\.(?:tsx?|css)$/.test(file)) {
        assert.doesNotMatch(source(file), /WorkspaceDate|MarketNotification|page-date|topbar-popover/, file);
      }
    }
  }
  scan("src");
  const workspace = source("src/styles/workspace.css");
  assert.doesNotMatch(workspace, /asset-avatar|empty-portfolio|empty-icon/);
  assert.equal((source("src/app/layout.tsx").match(/import "@\/styles\/workspace.css"/g) ?? []).length, 1);
  for (const file of ownedModules) assert.ok(existsSync(resolve(file)));
});
