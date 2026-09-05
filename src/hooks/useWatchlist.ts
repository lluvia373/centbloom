"use client";

import { legacyStorageKey,readBrandedStorage } from "@/lib/branded-storage";

import { useAuth } from "@/hooks/useAuth";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import type { StockSearchResult } from "@/lib/types";
import {
useCallback,
useMemo,
useState,
useSyncExternalStore,
} from "react";

export interface WatchlistItem {
  symbol: string;
  name: string;
  targetPrice: number | null;
  targetCurrency: string | null;
  addedAt: string;
}

const STORAGE_EVENT = "centifolio:watchlist-changed";
const UNAVAILABLE = "__storage_unavailable__";
const EMPTY: WatchlistItem[] = [];
const currencyIsValid = (value: unknown): value is string =>
  typeof value === "string" && /^(?:[A-Z]{3}|GBp)$/.test(value);

function parseStored(raw: string | null): {
  items: WatchlistItem[];
  error: string | null;
} {
  if (!raw) return { items: EMPTY, error: null };
  if (raw === UNAVAILABLE)
    return {
      items: EMPTY,
      error:
        "브라우저 저장소에 접근할 수 없습니다. 사이트의 저장소 권한을 확인해 주세요.",
    };
  try {
    const data: unknown = JSON.parse(raw);
    if (
      !data ||
      typeof data !== "object" ||
      !("version" in data) ||
      data.version !== 1 ||
      !("items" in data) ||
      !Array.isArray(data.items) ||
      data.items.length > 50
    )
      throw new Error();
    const seen = new Set<string>();
    const items = data.items.map((entry: unknown): WatchlistItem => {
      if (!entry || typeof entry !== "object") throw new Error();
      const item = entry as Record<string, unknown>;
      if (
        typeof item.symbol !== "string" ||
        !/^[A-Za-z0-9.^=_-]{1,40}$/.test(item.symbol) ||
        seen.has(item.symbol) ||
        typeof item.name !== "string" ||
        !item.name.trim() ||
        item.name.length > 200 ||
        typeof item.addedAt !== "string" ||
        !Number.isFinite(Date.parse(item.addedAt))
      )
        throw new Error();
      if (
        item.targetPrice !== null &&
        (typeof item.targetPrice !== "number" ||
          !Number.isFinite(item.targetPrice) ||
          item.targetPrice <= 0)
      )
        throw new Error();
      if (item.targetCurrency !== null && !currencyIsValid(item.targetCurrency))
        throw new Error();
      if (item.targetPrice !== null && item.targetCurrency === null)
        throw new Error();
      seen.add(item.symbol);
      return {
        symbol: item.symbol,
        name: item.name,
        targetPrice: item.targetPrice as number | null,
        targetCurrency: item.targetCurrency as string | null,
        addedAt: item.addedAt,
      };
    });
    return { items, error: null };
  } catch {
    return {
      items: EMPTY,
      error:
        "저장된 관심종목을 읽을 수 없습니다. 기존 데이터를 보호하기 위해 변경을 멈췄습니다.",
    };
  }
}

function readStorage(key: string) {
  try {
    return readBrandedStorage(window.localStorage, key) ?? "";
  } catch {
    return UNAVAILABLE;
  }
}

export function formatWatchPrice(price: number, currency: string) {
  if (currency === "GBp" || currency === "GBX")
    return `${price.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}p`;
  try {
    return new Intl.NumberFormat("ko-KR", {
      style: "currency",
      currency,
      maximumFractionDigits: currency === "KRW" || currency === "JPY" ? 0 : 2,
    }).format(price);
  } catch {
    return `${price.toLocaleString("ko-KR")} ${currency}`;
  }
}

export function useWatchlist({
  loadQuotes = true,
  quoteLimit = 50,
}: { loadQuotes?: boolean; quoteLimit?: number } = {}) {
  const { user, loading: authLoading } = useAuth();
  const key = `centifolio:watchlist:v1:${user?.id ?? "guest"}`;
  const subscribe = useCallback(
    (onChange: () => void) => {
      const handler = (event: Event) => {
        if (
          event instanceof StorageEvent &&
          event.key !== key &&
          event.key !== legacyStorageKey(key) &&
          event.key !== null
        )
          return;
        if (event instanceof CustomEvent && event.detail !== key) return;
        onChange();
      };
      window.addEventListener("storage", handler);
      window.addEventListener(STORAGE_EVENT, handler);
      return () => {
        window.removeEventListener("storage", handler);
        window.removeEventListener(STORAGE_EVENT, handler);
      };
    },
    [key],
  );
  const snapshot = useSyncExternalStore(
    subscribe,
    useCallback(() => readStorage(key), [key]),
    () => null,
  );
  const stored = useMemo(() => parseStored(snapshot), [snapshot]);
  const items = authLoading ? EMPTY : stored.items;
  const ready = snapshot !== null && !authLoading;
  const [writeError, setWriteError] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const live = useLiveQuotes(items.slice(0,quoteLimit).map((item) => item.symbol), {
    enabled: loadQuotes && ready, scope: key,
  });

  const mutate = useCallback(
    (update: (items: WatchlistItem[]) => WatchlistItem[]): string | null => {
      if (!ready)
        return "관심종목을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.";
      const current = parseStored(readStorage(key));
      if (current.error) return current.error;
      try {
        const next = update(current.items);
        window.localStorage.setItem(
          key,
          JSON.stringify({ version: 1, items: next }),
        );
        setWriteError(null);
        window.dispatchEvent(new CustomEvent(STORAGE_EVENT, { detail: key }));
        return null;
      } catch (error) {
        const message =
          error instanceof Error && error.name === "WatchlistError"
            ? error.message
            : "저장하지 못했습니다. 브라우저 저장 공간과 사이트 권한을 확인해 주세요.";
        setWriteError({ key, message });
        return message;
      }
    },
    [key, ready],
  );

  const addItem = useCallback(
    (stock: StockSearchResult) =>
      mutate((current) => {
        if (current.some((item) => item.symbol === stock.symbol))
          return current;
        if (current.length >= 50)
          throw Object.assign(
            new Error("관심종목은 최대 50개까지 저장할 수 있습니다."),
            { name: "WatchlistError" },
          );
        if (
          !/^[A-Za-z0-9.^=_-]{1,40}$/.test(stock.symbol) ||
          !stock.name.trim() ||
          stock.name.length > 200
        )
          throw Object.assign(new Error("이 종목 정보는 저장할 수 없습니다."), {
            name: "WatchlistError",
          });
        return [
          ...current,
          {
            symbol: stock.symbol,
            name: stock.name,
            targetPrice: null,
            targetCurrency: null,
            addedAt: new Date().toISOString(),
          },
        ];
      }),
    [mutate],
  );
  const removeItem = useCallback(
    (symbol: string) =>
      mutate((current) => current.filter((item) => item.symbol !== symbol)),
    [mutate],
  );
  const setTarget = useCallback(
    (symbol: string, price: number | null, currency: string | null) =>
      mutate((current) => {
        if (
          price !== null &&
          (!Number.isFinite(price) || price <= 0 || !currencyIsValid(currency))
        )
          throw Object.assign(
            new Error("올바른 통화와 0보다 큰 목표가를 입력해 주세요."),
            { name: "WatchlistError" },
          );
        return current.map((item) =>
          item.symbol === symbol
            ? {
                ...item,
                targetPrice: price,
                targetCurrency: price === null ? null : currency,
              }
            : item,
        );
      }),
    [mutate],
  );
  return {
    items,
    ready,
    addItem,
    removeItem,
    setTarget,
    error:
      stored.error ?? (writeError?.key === key ? writeError.message : null),
    quotes: live.quotes,
    failedSymbols: live.failedSymbols,
    quotesLoading: live.loading,
    quotesRefreshing: live.refreshing,
    refreshQuotes: live.refresh,
  };
}
