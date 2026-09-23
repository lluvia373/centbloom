"use client";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { sameFxPair, usableFxQuote, usableValuationFxQuote } from "@/features/market/fx";
import { formatKst } from "@/features/market/schedule/time";
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
  valuationFxNotice: string | null;
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
  const marketQuotes = useMemo(() => {
    const checkedAt = Math.max(live.checkedAt ?? 0, extra.checkedAt ?? 0);
    return Object.fromEntries(Object.entries({ ...live.quotes, ...extra.quotes }).filter(([symbol, quote]) => {
      if (!symbol.endsWith("KRW=X")) return true;
      const fetchedAt = Date.parse(quote.fetchedAt ?? "");
      return quote.currency === "KRW" && sameFxPair(symbol, quote.symbol) &&
        usableValuationFxQuote(Date.parse(quote.quotedAt ?? ""), Math.max(checkedAt, fetchedAt));
    }));
  }, [live.quotes, extra.quotes, live.checkedAt, extra.checkedAt]);
  const summary = useMemo(() => {
    if (!ledgerKnown) return null;
    const fx: Record<string, number> = { KRW: 1 };
    for (const [symbol, quote] of Object.entries(marketQuotes))
      if (symbol.endsWith("KRW=X")) fx[symbol.slice(0, -5)] = quote.price;
    return buildSummary(holdings, marketQuotes, fx, displayCurrency);
  }, [ledgerKnown, holdings, marketQuotes, displayCurrency]);
  const valuationFxNotice = useMemo(() => {
    const currencies = holdings.map(h => normalizeCurrency(marketQuotes[h.symbol]?.currency ?? h.currency ?? "USD"));
    const needed = new Set(currencies.filter(c => c !== "KRW" && c !== displayCurrency));
    if (displayCurrency === "USD" && currencies.some(c => c !== "USD")) needed.add("USD");
    const notes = [...needed].sort().flatMap(currency => {
      const quote = marketQuotes[`${currency}KRW=X`];
      if (!quote || !Number.isFinite(quote.price) || quote.price <= 0) return [];
      const at = Date.parse(quote.quotedAt!);
      const checkedAt = Math.max(live.checkedAt ?? 0, extra.checkedAt ?? 0, Date.parse(quote.fetchedAt!));
      return quote.fx?.valuationOnly || !usableFxQuote(at, checkedAt, quote.marketState)
        ? [`${currency}/KRW ${formatKst(at)}`] : [];
    });
    return notes.length ? `환율 지연 · ${notes.join(" · ")} 기준` : null;
  }, [holdings, marketQuotes, displayCurrency, live.checkedAt, extra.checkedAt]);
  const usdKrwQuote = marketQuotes["USDKRW=X"];
  // Historical USD display still promises a current conversion, not valuation-only FX.
  const currentUsdKrwRate = usdKrwQuote && !usdKrwQuote.fx?.valuationOnly &&
    usableFxQuote(Date.parse(usdKrwQuote.quotedAt!),
      Math.max(live.checkedAt ?? 0, extra.checkedAt ?? 0, Date.parse(usdKrwQuote.fetchedAt!)), usdKrwQuote.marketState) &&
    Number.isFinite(usdKrwQuote.price) && usdKrwQuote.price > 0
    ? usdKrwQuote.price : null;
  const value = useMemo(
    () => ({
      summary,
      loading: status === "loading" || (holdings.length > 0 && (live.loading || extra.loading)),
      marketDataError:
        live.failedSymbols.length || extra.failedSymbols.length
          ? "일부 시세 또는 환율을 업데이트하지 못했습니다."
          : null,
      valuationFxNotice,
      lastMarketUpdateAt: live.checkedAt,
      currentUsdKrwRate,
      refreshQuotes: live.refresh,
    }),
    [
      summary,
      status,
      holdings.length,
      currentUsdKrwRate,
      valuationFxNotice,
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
