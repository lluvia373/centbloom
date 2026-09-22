"use client";
import {
  loadPerformance,
  type HistoryResult,
} from "@/features/performance/service";
import { useAuth } from "@/hooks/useAuth";
import { useTransactions } from "@/hooks/usePortfolio";
import { useKstDate } from "@/shared/time/use-kst-date";
import { createSharedResource } from "@/shared/async/shared-resource";
import { useCallback, useSyncExternalStore } from "react";
const history = createSharedResource(loadPerformance, {
  points: [],
  trackingStartedAt: null,
  error: null,
} as HistoryResult);
export function usePerformanceHistory() {
  const { user, loading: authLoading } = useAuth();
  const { transactions, revision, status, error: ledgerError } = useTransactions();
  const today = useKstDate();
  const userId = user?.id ?? null;
  const key = JSON.stringify([userId, revision, today]);
  const ledgerKnown = revision !== "";
  const inputsReady = !authLoading && status !== "loading" && !!today;
  const enabled = inputsReady && ledgerKnown;
  const initialLedgerError = inputsReady && !ledgerKnown && status === "failed"
    ? ledgerError ?? "거래 기록을 불러오지 못했습니다."
    : null;
  const subscribe = useCallback(
    (listener: () => void) =>
      !enabled
        ? () => {}
        : history.subscribe(
            key,
            { userId, revision, transactions, today },
            listener,
          ),
    [key, userId, revision, transactions, today, enabled],
  );
  const state = useSyncExternalStore(
    subscribe,
    () => enabled ? history.snapshot(key) : history.initial,
    () => history.initial,
  );
  return {
    ...state.value,
    scopeKey: key,
    loading: initialLedgerError ? false : state.loading,
    refreshError: initialLedgerError ?? state.error,
    error: initialLedgerError ?? state.error ?? state.value.error,
  };
}
