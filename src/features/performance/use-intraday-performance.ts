"use client";
import { useAuth } from "@/hooks/useAuth";
import { useTransactions } from "@/hooks/usePortfolio";
import { useKstDate } from "@/shared/time/use-kst-date";
import { createSharedResource } from "@/shared/async/shared-resource";
import type { IntradayRange } from "@/features/market/intraday";
import type { DisplayCurrency } from "@/lib/types";
import { useCallback, useSyncExternalStore } from "react";
import { loadIntradayPerformance, type IntradayPerformance } from "./intraday-performance";

const intraday = createSharedResource(loadIntradayPerformance, {
  points: [], tradeDates: [], missingMarketData: false, profitKRW: null,
} as IntradayPerformance);

export function useIntradayPerformance(range: IntradayRange, currency: DisplayCurrency) {
  const { user, loading: authLoading } = useAuth();
  const { transactions, revision, status, error: ledgerError } = useTransactions();
  const day = useKstDate();
  const key = JSON.stringify([user?.id ?? null, revision, day, range, currency]);
  const enabled = !authLoading && status !== "loading" && !!revision && !!day;
  const subscribe = useCallback((listener: () => void) => enabled
    ? intraday.subscribe(key, { transactions, range, day, currency }, listener) : () => {},
  [enabled, key, transactions, range, day, currency]);
  const state = useSyncExternalStore(subscribe, () => enabled ? intraday.snapshot(key) : intraday.initial, () => intraday.initial);
  const initialLedgerError = !authLoading && status === "failed" && !revision
    ? ledgerError ?? "거래 기록을 불러오지 못했습니다." : null;
  return { ...state, loading: initialLedgerError ? false : state.loading, error: initialLedgerError ?? state.error, day };
}
