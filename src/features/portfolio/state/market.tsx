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
  refreshQuotes: () => Promise<void>;
};
const Context = createContext<MarketState | null>(null);
export function PortfolioMarketProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { transactions } = useTransactions();
  const { displayCurrency } = usePreferences();
  const pathname = usePathname();
  const enabled = ["/portfolio", "/insights"].includes(pathname);
  const holdings = useMemo(() => deriveHoldings(transactions), [transactions]);
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
    { enabled: enabled && holdings.length > 0 },
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
    if (!holdings.length) return null;
    const quotes = { ...live.quotes, ...extra.quotes };
    const fx: Record<string, number> = { KRW: 1 };
    for (const [symbol, quote] of Object.entries(quotes))
      if (symbol.endsWith("KRW=X")) fx[symbol.slice(0, -5)] = quote.price;
    return buildSummary(holdings, quotes, fx, displayCurrency);
  }, [holdings, live.quotes, extra.quotes, displayCurrency]);
  const value = useMemo(
    () => ({
      summary,
      loading: live.loading || extra.loading,
      marketDataError:
        live.failedSymbols.length || extra.failedSymbols.length
          ? "일부 시세 또는 환율을 업데이트하지 못했습니다."
          : null,
      lastMarketUpdateAt: live.checkedAt,
      refreshQuotes: live.refresh,
    }),
    [
      summary,
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
