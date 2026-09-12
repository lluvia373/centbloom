"use client";
import { useCallback, useSyncExternalStore } from "react";
import { createPollingStore } from "@/shared/async/polling-store";
import { marketRequests } from "@/lib/stock-api";
import type { MarketChangesFeed } from "./market-changes";

const store = createPollingStore<string, MarketChangesFeed>((key, signal) =>
  marketRequests.request(key, async signal => {
    const response = await fetch("/api/market-changes", { signal, cache: "no-store" });
    if (!response.ok) throw new Error("Changes unavailable");
    return response.json() as Promise<MarketChangesFeed>;
  }, { signal, ttlMs: 60_000, timeoutMs: 55_000 }),
);
const key = "market-changes:us";
let consumers = 0;
const visibility = () => store.setVisible(document.visibilityState === "visible");
const snapshot = () => store.snapshot(key);
export function useMarketChanges() {
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
  }, []);
  const view = useSyncExternalStore(subscribe, snapshot, () => store.empty);
  return { ...view, retry: () => { void store.refresh(key); } };
}
