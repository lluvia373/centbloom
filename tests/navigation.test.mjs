import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTypescript } from "./load-typescript.mjs";
const { navigationArea, investmentTab, navigationPageName } = loadTypescript("src/features/navigation/model.ts");

test("public detail pages stay in market; each private page and trade entry select the correct investment tab", () => {
  for (const path of ["/", "/discover", "/rankings/volume", "/rankings/gainers", "/rankings/losers", "/stock/AAPL", "/calendar", "/calendar/release", "/read/example", "/community"]) {
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

test("transaction history preserves actual records and edit/delete commands, including an empty ledger", () => {
  const commands = { updateTransaction: async () => null, removeTransaction: async () => null, restoreTransaction: async () => null };
  const record = { id: "isolated", symbol: "TEST", name: "Test", type: "buy", quantity: 1, price: 10, date: "2026-09-06", currency: "USD", fee: 0 };
  for (const records of [[], [record]]) {
    let received;
    const { TransactionHistory } = loadTypescript("src/features/portfolio/ui/TransactionHistory.tsx", {
      "@/hooks/useAuth": { useAuth: () => ({ user: { id: "isolated-user" } }) },
      "@/hooks/usePortfolio": { useTransactions: () => ({ transactions: records }), useTransactionCommands: () => commands },
      "@/components/TransactionList": { TransactionList: (props) => { received = props; return createElement("div", null, "personal-history"); } },
    });
    const html = renderToStaticMarkup(createElement(TransactionHistory));
    assert.doesNotMatch(html, /샘플/);
    assert.equal(received.transactions, records);
    assert.equal(received.onRemove, commands.removeTransaction);
    assert.equal(received.onUpdate, commands.updateTransaction);
    assert.equal(typeof received.onDeleted, "function");
  }
});

test("ranking routes retain their category page labels", () => {
  assert.equal(navigationPageName("/rankings/volume"), "거래량 상위");
  assert.equal(navigationPageName("/rankings/gainers"), "상승 종목");
  assert.equal(navigationPageName("/rankings/losers"), "하락 종목");
});
