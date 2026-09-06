"use client";
import { useCallback, useSyncExternalStore } from "react";
import { createPollingStore } from "@/shared/async/polling-store";
import { marketRequests } from "@/lib/stock-api";
import type { CalendarFeed } from "./release";
const store = createPollingStore<string, CalendarFeed>((query, signal) =>
  marketRequests.request("calendar:" + query, async (signal) => {
    const response = await fetch("/api/calendar?" + query, { signal, cache: "no-store" });
    if (!response.ok) throw new Error("경제지표를 가져오지 못했습니다.");
    return response.json() as Promise<CalendarFeed>;
  }, { signal, ttlMs: 10_000 }),
);
let consumers = 0;
const visibility = () => store.setVisible(document.visibilityState === "visible");
export function useCalendarFeed(query: string) {
  const subscribe = useCallback((listener: () => void) => {
    if (consumers++ === 0) {
      document.addEventListener("visibilitychange", visibility);
      visibility();
    }
    const stop = store.subscribe(query, listener);
    return () => {
      stop();
      if (--consumers === 0) document.removeEventListener("visibilitychange", visibility);
    };
  }, [query]);
  const snapshot = useCallback(() => store.snapshot(query), [query]);
  return { ...useSyncExternalStore(subscribe, snapshot, () => store.empty), retry: () => { void store.refresh(query); } };
}
