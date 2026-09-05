"use client";
import { createQuoteHub } from "@/features/market/quote-hub";
import { getQuote } from "@/lib/stock-api";
import { useCallback, useSyncExternalStore } from "react";
const hub = createQuoteHub(getQuote);
let consumers = 0;
const visibility = () => hub.setVisible(document.visibilityState === "visible");
export function useLiveQuotes(
  symbols: string[],
  { enabled = true }: { enabled?: boolean; scope?: string } = {},
) {
  const key = enabled ? [...new Set(symbols)].sort().join(",") : "";
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!key) return () => {};
      if (consumers++ === 0) {
        document.addEventListener("visibilitychange", visibility);
        visibility();
      }
      const unsubscribe = hub.subscribe(key.split(","), listener);
      return () => {
        unsubscribe();
        if (--consumers === 0)
          document.removeEventListener("visibilitychange", visibility);
      };
    },
    [key],
  );
  const snapshot = useCallback(
    () => hub.snapshot(key ? key.split(",") : []),
    [key],
  );
  const state = useSyncExternalStore(subscribe, snapshot, () => hub.empty);
  return { ...state, refresh: hub.refresh };
}
