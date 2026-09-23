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
// Keep just the last watched response set across a route change. Reports contain
// public stock facts only, and their original expiry still applies.
let recentReports = emptyReports;
const emptyViews: PollingView<WatchedStockReport | null>[] = [];
let consumers = 0;
const visibility = () => store.setVisible(document.visibilityState === "visible");

export function getCachedStockReport(symbol: string, now = Date.now()) {
  const current = store.snapshot(symbol).data;
  const report = current === undefined ? recentReports[symbol] : current;
  return report && report.expiresAt > now ? report : undefined;
}

/** A truthful single-stock view over the same prepared-report store used at home. */
export function createStockReportObserver(symbol: string, source = store, now = Date.now, initialData = getCachedStockReport(symbol)) {
  let current: PollingView<WatchedStockReport | null> | undefined;
  let view = source.empty;
  let expired = false;
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void) {
      if (consumers++ === 0) { document.addEventListener("visibilitychange", visibility); visibility(); }
      listeners.add(listener);
      const stop = source.subscribe(symbol, listener);
      return () => {
        listeners.delete(listener);
        stop();
        if (--consumers === 0) document.removeEventListener("visibilitychange", visibility);
      };
    },
    snapshot() {
      const next = source.snapshot(symbol);
      const data = next.data === undefined ? initialData : next.data;
      const hasExpired = !!data && data.expiresAt <= now();
      if (current !== next || expired !== hasExpired) {
        current = next;
        expired = hasExpired;
        view = hasExpired ? { ...next, data: undefined, failed: true } : data !== next.data ? { ...next, data } : next;
      }
      return view;
    },
    refresh: () => { listeners.forEach(listener => listener()); void source.refresh(symbol); },
  };
}

export function useStockReport(symbol: string) {
  const observer = useMemo(() => createStockReportObserver(symbol), [symbol]);
  const view = useSyncExternalStore(observer.subscribe, observer.snapshot, () => store.empty);
  const expiresAt = view.data?.expiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setTimeout(observer.refresh, Math.max(0, expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [expiresAt, observer]);
  return { ...view, retry: observer.refresh };
}

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
  useEffect(() => { if (Object.keys(reports).length) recentReports = reports; }, [reports]);
  const expiry = Math.min(...Object.values(reports).map(report => report.expiresAt));
  useEffect(() => {
    if (!Number.isFinite(expiry)) return;
    const timer = setTimeout(observer.refresh, Math.max(0, expiry - Date.now()));
    return () => clearTimeout(timer);
  }, [expiry, observer]);
  return reports;
}
