"use client";
import {
  loadPerformance,
  type HistoryResult,
} from "@/features/performance/service";
import { useAuth } from "@/hooks/useAuth";
import { useTransactions } from "@/hooks/usePortfolio";
import { kstDate } from "@/lib/performance";
import { createSharedResource } from "@/shared/async/shared-resource";
import { useCallback, useSyncExternalStore } from "react";
const history = createSharedResource(loadPerformance, {
  points: [],
  trackingStartedAt: null,
  error: null,
} as HistoryResult);
let date = kstDate();
const dateListeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
function subscribeDate(listener: () => void) {
  dateListeners.add(listener);
  if (!timer)
    timer = setInterval(() => {
      const next = kstDate();
      if (next !== date) {
        date = next;
        dateListeners.forEach((fn) => fn());
      }
    }, 30_000);
  return () => {
    dateListeners.delete(listener);
    if (!dateListeners.size) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}
export function usePerformanceHistory() {
  const { user } = useAuth();
  const { transactions, revision, status } = useTransactions();
  const today = useSyncExternalStore(
    subscribeDate,
    () => date,
    () => date,
  );
  const userId = user?.id ?? null;
  const key = JSON.stringify([userId, revision, today]);
  const enabled = status !== "loading";
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
