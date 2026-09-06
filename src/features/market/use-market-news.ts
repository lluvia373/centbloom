"use client";
import { useCallback, useSyncExternalStore } from "react";
import { marketRequests } from "@/lib/stock-api";
import { createPollingStore } from "@/shared/async/polling-store";
import type { NewsFeed } from "./trending-news";

const store = createPollingStore<string, NewsFeed>((key, signal) =>
  marketRequests.request("news-feed:" + key, async (signal) => {
    const response = await fetch("/api/news" + (key === "trending" ? "" : "?symbol=" + encodeURIComponent(key)),
      { signal, cache: "no-store" });
    if (!response.ok) throw new Error("News unavailable");
    return response.json() as Promise<NewsFeed>;
  }, { signal, ttlMs: 0, timeoutMs: 60_000 }),
);
let consumers = 0;
const visibility = () => store.setVisible(document.visibilityState === "visible");
export function useMarketNews(symbol?: string) {
  const key = symbol?.trim().toUpperCase() || "trending";
  const subscribe = useCallback((listener: () => void) => {
    if (consumers++ === 0) {
      document.addEventListener("visibilitychange", visibility);
      visibility();
    }
    const stop = store.subscribe(key, listener);
    return () => {
      stop();
      if (--consumers === 0) document.removeEventListener("visibilitychange", visibility);
    };
  }, [key]);
  const snapshot = useCallback(() => store.snapshot(key), [key]);
  const view = useSyncExternalStore(subscribe, snapshot, () => store.empty);
  return {
    stories: view.data?.stories ?? [],
    loading: view.loading && !view.data,
    error: view.failed,
    partial: view.data?.partial ?? false,
    retry: () => { void store.refresh(key); },
  };
}
