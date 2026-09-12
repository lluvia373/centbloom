"use client";

import { getWatchlistStore } from "@/features/watchlist/browser-store";
import { type WatchlistItem } from "@/features/watchlist/model";
import { EMPTY_WATCHLIST } from "@/features/watchlist/store";
import { useAuth } from "@/hooks/useAuth";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import type { StockSearchResult } from "@/lib/types";
import { useCallback, useSyncExternalStore } from "react";

export type { WatchlistItem } from "@/features/watchlist/model";
const noSubscription = () => () => {};
const emptySnapshot = () => EMPTY_WATCHLIST;

export function formatWatchPrice(price: number, currency: string) {
  if (currency === "GBp" || currency === "GBX")
    return `${price.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}p`;
  try {
    return new Intl.NumberFormat("ko-KR", {
      style: "currency", currency,
      maximumFractionDigits: currency === "KRW" || currency === "JPY" ? 0 : 2,
    }).format(price);
  } catch { return `${price.toLocaleString("ko-KR")} ${currency}`; }
}

export function useWatchlist({
  loadQuotes = true, quoteLimit = 50,
}: { loadQuotes?: boolean; quoteLimit?: number } = {}) {
  const { user, configured, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const store = authLoading ? null : getWatchlistStore(userId, configured);
  const snapshot = useSyncExternalStore(store?.subscribe ?? noSubscription, store?.getSnapshot ?? emptySnapshot, emptySnapshot);
  const { items, ready } = snapshot;
  const live = useLiveQuotes(items.slice(0, quoteLimit).map((item) => item.symbol), {
    enabled: loadQuotes && ready, scope: store?.scope ?? "watchlist:unavailable",
  });
  const unavailable = configured && !user ? "로그인 후 관심종목을 저장할 수 있습니다." : "관심종목을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.";
  const addItem = useCallback(async (stock: StockSearchResult): Promise<string | null> => {
    const item: WatchlistItem = { symbol: stock.symbol, name: stock.name, targetPrice: null, targetCurrency: null, addedAt: new Date().toISOString() };
    return store ? store.execute({ operation: "add", payload: item }) : unavailable;
  }, [store, unavailable]);
  const removeItem = useCallback(async (symbol: string) => store
    ? store.execute({ operation: "remove", payload: { symbol } }) : unavailable, [store, unavailable]);
  const setTarget = useCallback(async (symbol: string, price: number | null, currency: string | null) => store
    ? store.execute({ operation: "target", payload: { symbol, targetPrice: price, targetCurrency: price === null ? null : currency } }) : unavailable, [store, unavailable]);
  const refresh = useCallback(async () => { await store?.refresh(); }, [store]);
  return {
    ...snapshot, addItem, removeItem, setTarget, refresh,
    quotes: live.quotes, failedSymbols: live.failedSymbols,
    quotesLoading: live.loading, quotesRefreshing: live.refreshing, refreshQuotes: live.refresh,
  };
}
