"use client";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { normalizeCurrency } from "@/lib/currency";
import { deriveHoldings } from "@/lib/portfolio";
import type { PortfolioSummary } from "@/lib/types";
import { usePathname } from "next/navigation";
import { createContext, useContext, useMemo } from "react";
import { buildSummary } from "../model/summary";
import { useTransactions } from "./ledger";
import { usePreferences } from "./preferences";
type MarketState = {
  summary: PortfolioSummary | null;
  loading: boolean;
  marketDataError: string | null;
  lastMarketUpdateAt: number | null;
  currentUsdKrwRate: number | null;
  refreshQuotes: () => Promise<void>;
};
const Context = createContext<MarketState | null>(null);
export function PortfolioMarketProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { transactions, status, revision } = useTransactions();
  const { displayCurrency } = usePreferences();
  const pathname = usePathname();
  const enabled = ["/portfolio", "/insights"].includes(pathname);
  const ledgerKnown = status !== "loading" && revision !== "";
  const holdings = useMemo(() => deriveHoldings(transactions), [transactions]);
  const needsMarket = ledgerKnown && (holdings.length > 0 ||
    (transactions.length > 0 && displayCurrency === "USD"));
  const symbols = holdings.map((h) => h.symbol);
  const knownCurrencies = [
    ...new Set([
      "USD",
      ...holdings.map((h) => normalizeCurrency(h.currency ?? "USD")),
    ]),
  ].filter((c) => c !== "KRW");
  // Known FX and holdings subscribe together. Only newly discovered currencies wait for quotes.
  const live = useLiveQuotes(
    [...symbols, ...knownCurrencies.map((c) => `${c}KRW=X`)],
    { enabled: enabled && needsMarket },
  );
  const discovered = [
    ...new Set(
      symbols
        .map((s) => live.quotes[s]?.currency)
        .filter((c): c is string => !!c)
        .map(normalizeCurrency),
    ),
  ].filter((c) => c !== "KRW" && !knownCurrencies.includes(c));
  const extra = useLiveQuotes(
    discovered.map((c) => `${c}KRW=X`),
    { enabled: enabled && holdings.length > 0 },
  );
  const summary = useMemo(() => {
    if (!ledgerKnown) return null;
    const quotes = { ...live.quotes, ...extra.quotes };
    const fx: Record<string, number> = { KRW: 1 };
    for (const [symbol, quote] of Object.entries(quotes))
      if (symbol.endsWith("KRW=X")) fx[symbol.slice(0, -5)] = quote.price;
    return buildSummary(holdings, quotes, fx, displayCurrency);
  }, [ledgerKnown, holdings, live.quotes, extra.quotes, displayCurrency]);
  const usdKrwQuote = live.quotes["USDKRW=X"];
  const currentUsdKrwRate = usdKrwQuote && Number.isFinite(usdKrwQuote.price) && usdKrwQuote.price > 0
    ? usdKrwQuote.price : null;
  const value = useMemo(
    () => ({
      summary,
      loading: status === "loading" || (holdings.length > 0 && (live.loading || extra.loading)),
      marketDataError:
        live.failedSymbols.length || extra.failedSymbols.length
          ? "일부 시세 또는 환율을 업데이트하지 못했습니다."
          : null,
      lastMarketUpdateAt: live.checkedAt,
      currentUsdKrwRate,
      refreshQuotes: live.refresh,
    }),
    [
      summary,
      status,
      holdings.length,
      currentUsdKrwRate,
      live.loading,
      extra.loading,
      live.failedSymbols,
      extra.failedSymbols,
      live.checkedAt,
      live.refresh,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function usePortfolioMarket() {
  const value = useContext(Context);
  if (!value) throw new Error("PortfolioMarketProvider is required");
  return value;
}
