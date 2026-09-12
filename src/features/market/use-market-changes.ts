"use client";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPollingStore } from "@/shared/async/polling-store";
import { createRequestCache } from "@/shared/async/request-cache";
import { fetchPreparedFeed } from "@/shared/async/prepared-feed";
import type { ResearchedChangesFeed } from "./change-research";

const requests = createRequestCache({ concurrency: 1, maxEntries: 2 });
const store = createPollingStore<string, ResearchedChangesFeed>((key, signal) =>
  requests.request(key, signal => fetchPreparedFeed<ResearchedChangesFeed>("/api/market-changes", signal),
    { signal, ttlMs: 0, timeoutMs: 60_000 }),
);
const key = "market-changes:us";
let consumers = 0;
const visibility = () => store.setVisible(document.visibilityState === "visible");
export function useMarketChanges(initialData?: ResearchedChangesFeed | null) {
  const initialView = useMemo(() => initialData ? { data: initialData, loading: false, failed: false } : store.empty, [initialData]);
  const subscribe = useCallback((listener: () => void) => {
    if (consumers++ === 0) {
      document.addEventListener("visibilitychange", visibility);
      visibility();
    }
    const stop = store.subscribe(key, listener, initialData ?? undefined);
    return () => {
      stop();
      if (--consumers === 0) document.removeEventListener("visibilitychange", visibility);
    };
  }, [initialData]);
  const snapshot = useCallback(() => {
    const current = store.snapshot(key);
    return current.data ? current : initialView.data && !current.failed ? initialView : current;
  }, [initialView]);
  const view = useSyncExternalStore(subscribe, snapshot, () => initialView);
  const [expiredAt, setExpiredAt] = useState(0);
  const expiresAt = view.data?.expiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setTimeout(() => { setExpiredAt(expiresAt); void store.refresh(key); }, Math.max(0, expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [expiresAt]);
  const data = view.data && view.data.expiresAt > expiredAt ? view.data : undefined;
  return { ...view, data, failed: view.failed || (!!view.data && !data), retry: () => { void store.refresh(key); } };
}
