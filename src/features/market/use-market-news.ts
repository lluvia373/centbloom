"use client";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { createRequestCache } from "@/shared/async/request-cache";
import { createPollingStore } from "@/shared/async/polling-store";
import { fetchPreparedFeed } from "@/shared/async/prepared-feed";
import type { NewsFeed } from "./trending-news";

const newsRequests = createRequestCache({ concurrency: 2, maxEntries: 32 });
const store = createPollingStore<string, NewsFeed>((key, signal) =>
  newsRequests.request("news-feed:" + key, signal => fetchPreparedFeed<NewsFeed>(
    "/api/news" + (key === "trending" ? "" : "?symbol=" + encodeURIComponent(key)), signal),
    { signal, ttlMs: 0, timeoutMs: 60_000 }),
);
let consumers = 0;
const visibility = () => store.setVisible(document.visibilityState === "visible");
export function useMarketNews(symbol?: string, initialData?: NewsFeed | null) {
  const initialView = useMemo(() => initialData ? { data: initialData, loading: false, failed: false } : store.empty, [initialData]);
  const key = symbol?.trim().toUpperCase() || "trending";
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
  }, [key, initialData]);
  const snapshot = useCallback(() => {
    const current = store.snapshot(key);
    return current.data ? current : initialView.data && !current.failed ? initialView : current;
  }, [key, initialView]);
  const view = useSyncExternalStore(subscribe, snapshot, () => initialView);
  return {
    stories: view.data?.stories ?? [],
    loading: view.loading && !view.data,
    error: view.failed || !!view.data?.stale,
    partial: view.data?.partial ?? false,
    retry: () => { void store.refresh(key); },
  };
}
