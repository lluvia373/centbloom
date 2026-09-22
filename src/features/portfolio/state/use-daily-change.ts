"use client";
import type { MidnightBaseline } from "@/features/market/baseline";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { getMidnightBaseline } from "@/lib/stock-api";
import { createSharedResource } from "@/shared/async/shared-resource";
import { mapLimited } from "@/shared/async/pool";
import { useKstDate } from "@/shared/time/use-kst-date";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { calculateDailyChange, planDailyChange, unavailableDailyChange } from "../model/daily-change";
import { useTransactions } from "./ledger";
import { usePreferences } from "./preferences";

interface BaselineInput { symbols: string[]; date: string }
const resource = createSharedResource(async ({ symbols, date }: BaselineInput, signal: AbortSignal) => {
  const values = await mapLimited(symbols, 6, async (symbol) => {
    try { return await getMidnightBaseline(symbol, date, signal); }
    catch { signal.throwIfAborted(); return null; }
  });
  signal.throwIfAborted();
  return Object.fromEntries(values.filter((item): item is MidnightBaseline => item !== null)
    .map((item) => [item.symbol, item]));
}, {} as Record<string, MidnightBaseline>);

/** One shared baseline request set; current prices continue through the existing quote hub. */
export function usePortfolioDailyChange() {
  const { transactions, status, revision } = useTransactions();
  const { displayCurrency } = usePreferences();
  const date = useKstDate();
  const plan = useMemo(() => planDailyChange(transactions, date, displayCurrency), [transactions, date, displayCurrency]);
  const ledgerKnown = status !== "loading" && revision !== "";
  const enabled = ledgerKnown && !!date && plan.symbols.length > 0;
  const live = useLiveQuotes(plan.liveSymbols, { enabled });
  const key = JSON.stringify([date, plan.baselineSymbols]);
  const subscribe = useCallback((listener: () => void) => {
    if (!enabled) return () => {};
    const [day, symbols] = JSON.parse(key) as [string, string[]];
    return resource.subscribe(key, { date: day, symbols }, listener);
  }, [enabled, key]);
  const baseline = useSyncExternalStore(subscribe, () => resource.snapshot(key), () => resource.initial);
  const loading = enabled && (live.loading || (baseline.loading && !Object.keys(baseline.value).length));
  const result = useMemo(() => !date || status === "loading" || loading
    ? unavailableDailyChange(date, "자정 기준 자료 확인 중")
    : !ledgerKnown ? unavailableDailyChange(date, "거래 기록 확인 필요")
    : calculateDailyChange({ transactions, date, displayCurrency, quotes: live.quotes, baselines: baseline.value, failedSymbols: live.failedSymbols }),
  [date, status, loading, ledgerKnown, transactions, displayCurrency, live.quotes, live.failedSymbols, baseline.value]);
  const baselineLagSeconds = Math.max(0, ...Object.values(baseline.value)
    .filter((item) => item.status === "available" && item.precision === "minute")
    .map((item) => Math.max(0, (Date.parse(item.baselineAt) - Date.parse(item.sourceEndAt ?? item.baselineAt)) / 1_000)));
  return { ...result, loading, baselineLagSeconds };
}
