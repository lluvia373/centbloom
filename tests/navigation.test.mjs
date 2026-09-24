import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTypescript } from "./load-typescript.mjs";
const { navigationArea, investmentTab, navigationPageName } = loadTypescript("src/features/navigation/model.ts");

test("guru navigation is a separate public area including quarter detail", () => {
  for (const path of ["/gurus", "/gurus/", "/gurus/pershing-square"]) {
    assert.equal(navigationArea(path), "gurus");
    assert.equal(navigationPageName(path), "구루 포트폴리오");
    assert.equal(investmentTab(path), undefined);
  }
  assert.equal(navigationArea("/gurus-other"), "market");
});

test("public detail pages stay in market; each private page and trade entry select the correct investment tab", () => {
  for (const path of ["/", "/discover", "/rankings/volume", "/rankings/gainers", "/rankings/losers", "/stock/AAPL", "/calendar", "/calendar/release", "/read/example", "/community"]) {
    assert.equal(navigationArea(path), "market");
    assert.equal(investmentTab(path), undefined);
  }
  for (const path of ["/portfolio", "/watchlist", "/journal", "/transactions"]) {
    assert.equal(navigationArea(path), "investment");
    assert.equal(investmentTab(path).href, path);
    assert.equal(investmentTab(path + "/").href, path);
  }
  assert.equal(navigationArea("/insights"), "investment");
  assert.equal(investmentTab("/insights/").href, "/portfolio");
  assert.equal(navigationPageName("/insights"), "보유자산");
  assert.equal(investmentTab("/search").href, "/transactions");
  assert.equal(navigationArea("/settings"), "settings");
  assert.equal(investmentTab("/settings"), undefined);
});

test("investment links have exactly one current page; public pages and settings omit the internal navigation", () => {
  const Link = ({ children, ...props }) => createElement("a", props, children);
  for (const pathname of ["/", "/settings", "/portfolio", "/insights", "/transactions", "/search"]) {
    const { InvestmentNavigation } = loadTypescript("src/features/navigation/InvestmentNavigation.tsx", {
      "next/navigation": { usePathname: () => pathname },
      "next/link": { default: Link },
      "./navigation.module.css": { default: { tabs: "tabs" } },
    });
    const html = renderToStaticMarkup(createElement(InvestmentNavigation));
    if (["/", "/settings"].includes(pathname)) assert.equal(html, "");
    else {
      assert.equal((html.match(/<a /g) ?? []).length, 4);
      assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
      assert.match(html, /aria-label="내 투자 메뉴"/);
      assert.ok(html.includes('href="/transactions"'));
      assert.doesNotMatch(html, /href="\/insights"|성과 분석/);
    }
  }
});

test("the former analytics address redirects into holdings without rendering a second dashboard", () => {
  const redirectSignal = new Error("redirect");
  let destination;
  const { default: InsightsPage } = loadTypescript("src/app/insights/page.tsx", {
    "next/navigation": { redirect: (href) => { destination = href; throw redirectSignal; } },
  });
  assert.throws(() => InsightsPage(), (error) => error === redirectSignal);
  assert.equal(destination, "/portfolio#performance");
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
