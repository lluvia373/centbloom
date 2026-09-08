"use client";
import { useCallback, useSyncExternalStore } from "react";
import { marketRequests } from "@/lib/stock-api";
import { MOVERS_CACHE_MS, type MoverKind, type MoversResult } from "./movers-model";
import { createMoversStore } from "./movers-store";
const store = createMoversStore((kind, signal) =>
  marketRequests.request(
    "movers:us:" + kind,
    async (signal) => {
      const response = await fetch("/api/movers?kind=" + kind, {
        signal,
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Movers unavailable");
      return response.json() as Promise<MoversResult>;
    },
    { signal, ttlMs: MOVERS_CACHE_MS },
  ),
);
let consumers = 0;
const visibility = () =>
  store.setVisible(document.visibilityState === "visible");
export function useMarketMovers(kind: MoverKind) {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (consumers++ === 0) {
        document.addEventListener("visibilitychange", visibility);
        visibility();
      }
      const stop = store.subscribe(kind, listener);
      return () => {
        stop();
        if (--consumers === 0)
          document.removeEventListener("visibilitychange", visibility);
      };
    },
    [kind],
  );
  const snapshot = useCallback(() => store.snapshot(kind), [kind]);
  const view = useSyncExternalStore(subscribe, snapshot, () => store.empty);
  return { ...view, refresh: () => store.refresh(kind) };
}
