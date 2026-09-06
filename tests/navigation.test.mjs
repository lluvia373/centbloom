import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTypescript } from "./load-typescript.mjs";
const { navigationArea, investmentTab } = loadTypescript("src/features/navigation/model.ts");

test("public detail pages stay in market; each private page and trade entry select the correct investment tab", () => {
  for (const path of ["/", "/discover", "/stock/AAPL", "/calendar", "/calendar/release", "/read/example", "/community"]) {
    assert.equal(navigationArea(path), "market");
    assert.equal(investmentTab(path), undefined);
  }
  for (const path of ["/portfolio", "/watchlist", "/insights", "/journal", "/transactions"]) {
    assert.equal(navigationArea(path), "investment");
    assert.equal(investmentTab(path).href, path);
    assert.equal(investmentTab(path + "/").href, path);
  }
  assert.equal(investmentTab("/search").href, "/transactions");
  assert.equal(navigationArea("/settings"), "settings");
  assert.equal(investmentTab("/settings"), undefined);
});

test("investment links have exactly one current page; public pages and settings omit the internal navigation", () => {
  const Link = ({ children, ...props }) => createElement("a", props, children);
  for (const pathname of ["/", "/settings", "/portfolio", "/transactions", "/search"]) {
    const { InvestmentNavigation } = loadTypescript("src/features/navigation/InvestmentNavigation.tsx", {
      "next/navigation": { usePathname: () => pathname },
      "next/link": { default: Link },
      "./navigation.module.css": { default: { tabs: "tabs" } },
    });
    const html = renderToStaticMarkup(createElement(InvestmentNavigation));
    if (["/", "/settings"].includes(pathname)) assert.equal(html, "");
    else {
      assert.equal((html.match(/<a /g) ?? []).length, 5);
      assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
      assert.match(html, /aria-label="내 투자 메뉴"/);
      assert.ok(html.includes('href="/transactions"'));
    }
  }
});

test("new transaction history route retains the existing private auth boundary", () => {
  const { isPublicRoute } = loadTypescript("src/features/auth/public-routes.ts");
  assert.equal(isPublicRoute("/transactions"), false);
  const { AuthGate } = loadTypescript("src/components/AuthGate.tsx", {
    "next/navigation": { usePathname: () => "/transactions" },
    "@/hooks/useAuth": { useAuth: () => ({ user: null, configured: true, loading: true }) },
    "@/app/auth.css": {},
  });
  assert.doesNotMatch(renderToStaticMarkup(createElement(AuthGate, null, "PRIVATE_HISTORY")), /PRIVATE_HISTORY/);
});

test("moved transaction history preserves personal command wiring and keeps sample records read-only", () => {
  const commands = { updateTransaction: async () => null, removeTransaction: async () => null, restoreTransaction: async () => null };
  const records = [{ id: "isolated", symbol: "TEST", name: "Test", type: "buy", quantity: 1, price: 10, date: "2026-09-06", currency: "USD", fee: 0 }];
  for (const isDemo of [false, true]) {
    let received;
    const { TransactionHistory } = loadTypescript("src/features/portfolio/ui/TransactionHistory.tsx", {
      "@/hooks/useAuth": { useAuth: () => ({ user: { id: "isolated-user" } }) },
      "@/hooks/useWorkspace": { useWorkspace: () => ({ isDemo }) },
      "@/hooks/usePortfolio": { useTransactions: () => ({ transactions: records }), useTransactionCommands: () => commands },
      "@/components/AssetAvatar": { AssetAvatar: () => null },
      "@/components/TransactionList": { TransactionList: (props) => { received = props; return createElement("div", null, "personal-history"); } },
    });
    const html = renderToStaticMarkup(createElement(TransactionHistory));
    if (isDemo) {
      assert.equal(received, undefined);
      assert.match(html, /샘플 거래 기록/);
      assert.doesNotMatch(html, /personal-history/);
    } else {
      assert.equal(received.transactions, records);
      assert.equal(received.onRemove, commands.removeTransaction);
      assert.equal(received.onUpdate, commands.updateTransaction);
      assert.equal(typeof received.onDeleted, "function");
    }
  }
});
