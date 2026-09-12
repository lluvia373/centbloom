"use client";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { createPollingStore, type PollingView } from "@/shared/async/polling-store";
import { createRequestCache } from "@/shared/async/request-cache";
import { fetchPreparedFeed } from "@/shared/async/prepared-feed";
import type { WatchedStockReport } from "./watched-report";

// Limit HTTP work, not the time spent waiting for a background collection.
const requests = createRequestCache({ concurrency: 4, maxEntries: 100 });
const queuedFetch: typeof fetch = async (input, init) => {
  const response = await requests.request(String(input), signal => fetch(input, { ...init, signal }),
    { signal: init?.signal ?? undefined, ttlMs: 0, timeoutMs: 15_000 });
  return response.clone();
};
const store = createPollingStore<string, WatchedStockReport | null>(async (symbol, signal) => {
  const combined = AbortSignal.any([signal, AbortSignal.timeout(60_000)]);
  const request: typeof fetch = async (input, init) => {
    const response = await queuedFetch(input, init);
    // Non-US stocks remain in the watchlist; this research currently covers US equities.
    return response.status === 422 ? new Response("null", { status: 200 }) : response;
  };
  return fetchPreparedFeed<WatchedStockReport | null>("/api/stock-report?symbol=" + encodeURIComponent(symbol), combined, request);
});
const emptyReports: Record<string, WatchedStockReport> = {};
const emptyViews: PollingView<WatchedStockReport | null>[] = [];
let consumers = 0;
const visibility = () => store.setVisible(document.visibilityState === "visible");

/** Cache immutable snapshots at the external-store boundary, including report expiry. */
export function createWatchedReportObserver(key: string, source = store, now = Date.now) {
    const names = key ? key.split("|") : [];
    let current = emptyViews;
    let reports = emptyReports;
    let expiresAt = Infinity;
    const listeners = new Set<() => void>();
    return {
      subscribe(listener: () => void) {
        if (!names.length) return () => {};
        if (consumers++ === 0) { document.addEventListener("visibilitychange", visibility); visibility(); }
        listeners.add(listener);
        const stops = names.map(symbol => source.subscribe(symbol, listener));
        return () => {
          listeners.delete(listener);
          stops.forEach(stop => stop());
          if (--consumers === 0) document.removeEventListener("visibilitychange", visibility);
        };
      },
      snapshot() {
        const next = names.map(symbol => source.snapshot(symbol));
        const checkedAt = now();
        if (expiresAt > checkedAt && current.length === next.length
          && current.every((view, index) => view === next[index])) return reports;
        current = next;
        reports = {};
        expiresAt = Infinity;
        for (let index = 0; index < next.length; index++) {
          const report = next[index].data;
          if (report && report.expiresAt > checkedAt) {
            reports[names[index]] = report;
            expiresAt = Math.min(expiresAt, report.expiresAt);
          }
        }
        return reports;
      },
      refresh() {
        // Expired data disappears even while hidden or an earlier request is still running.
        listeners.forEach(listener => listener());
        names.forEach(symbol => { void source.refresh(symbol); });
      },
    };
}

/** Subscribe to stock data once even when multiple home sections use it. */
export function useWatchedReports(symbols: string[]) {
  const key = [...new Set(symbols)].sort().join("|");
  const observer = useMemo(() => createWatchedReportObserver(key), [key]);
  const reports = useSyncExternalStore(observer.subscribe, observer.snapshot, () => emptyReports);
  const expiry = Math.min(...Object.values(reports).map(report => report.expiresAt));
  useEffect(() => {
    if (!Number.isFinite(expiry)) return;
    const timer = setTimeout(observer.refresh, Math.max(0, expiry - Date.now()));
    return () => clearTimeout(timer);
  }, [expiry, observer]);
  return reports;
}
