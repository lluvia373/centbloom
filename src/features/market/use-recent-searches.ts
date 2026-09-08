"use client";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { createRecentSearches, parseRecentSearches, type RecentStock } from "./recent-searches";

const repository = createRecentSearches(() => window.localStorage);
const changed = "centbloom:recent-searches-changed";
const serverSnapshot = () => null;
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(changed, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(changed, listener);
  };
}
export function useRecentSearches(userId: string | null) {
  const snapshot = useCallback(() => repository.read(userId), [userId]);
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const stocks = useMemo(() => parseRecentSearches(raw), [raw]);
  const record = useCallback((stock: RecentStock) => {
    const saved = repository.record(userId, stock);
    if (saved) window.dispatchEvent(new Event(changed));
    return saved;
  }, [userId]);
  return { stocks, record };
}
