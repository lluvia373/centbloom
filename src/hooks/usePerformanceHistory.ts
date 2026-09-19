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
  const { user } = useAuth();
  const { transactions, revision, status } = useTransactions();
  const today = useKstDate();
  const userId = user?.id ?? null;
  const key = JSON.stringify([userId, revision, today]);
  const enabled = status !== "loading" && !!today;
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
    () => history.snapshot(key),
    () => history.initial,
  );
  return {
    ...state.value,
    loading: state.loading,
    error: state.error ?? state.value.error,
  };
}
