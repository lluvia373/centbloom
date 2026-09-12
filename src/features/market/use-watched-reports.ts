"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
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

/** Subscribe to stock data once even when multiple home sections use it. */
export function useWatchedReports(symbols: string[]) {
  const key = [...new Set(symbols)].sort().join("|");
  const observer = useMemo(() => {
    const names = key ? key.split("|") : [];
    let current = emptyViews;
    return {
      names,
      subscribe(listener: () => void) {
        if (!names.length) return () => {};
        if (consumers++ === 0) { document.addEventListener("visibilitychange", visibility); visibility(); }
        const stops = names.map(symbol => store.subscribe(symbol, listener));
        return () => {
          stops.forEach(stop => stop());
          if (--consumers === 0) document.removeEventListener("visibilitychange", visibility);
        };
      },
      snapshot() {
        const next = names.map(symbol => store.snapshot(symbol));
        if (current.length !== next.length || current.some((view, index) => view !== next[index])) current = next;
        return current;
      },
    };
  }, [key]);
  const views = useSyncExternalStore(observer.subscribe, observer.snapshot, () => emptyViews);
  const [expiredAt, setExpiredAt] = useState(0);
  const reports = useMemo(() => {
    if (!views.length) return emptyReports;
    const next: Record<string, WatchedStockReport> = {};
    for (let i = 0; i < views.length; i++) {
      const report = views[i].data;
      if (report && report.expiresAt > Math.max(expiredAt, Date.now())) next[observer.names[i]] = report;
    }
    return next;
  }, [views, observer, expiredAt]);
  const expiry = Math.min(...Object.values(reports).map(report => report.expiresAt));
  useEffect(() => {
    if (!Number.isFinite(expiry)) return;
    const timer = setTimeout(() => {
      setExpiredAt(expiry);
      observer.names.forEach(symbol => { void store.refresh(symbol); });
    }, Math.max(0, expiry - Date.now()));
    return () => clearTimeout(timer);
  }, [expiry, observer]);
  return reports;
}
