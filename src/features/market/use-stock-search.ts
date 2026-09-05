"use client";
import type { MarketFilter } from "@/lib/markets";
import { searchStocks } from "@/lib/stock-api";
import type { StockSearchResult } from "@/lib/types";
import { useEffect, useState } from "react";
export function useStockSearch(
  query: string,
  {
    market = "all",
    delay = 300,
    retry = 0,
    limit = 20,
    enabled = true,
  }: {
    market?: MarketFilter;
    delay?: number;
    retry?: number;
    limit?: number;
    enabled?: boolean;
  } = {},
) {
  const needle = query.trim();
  const key = JSON.stringify([needle, market, retry]);
  const [state, setState] = useState<{
    key: string;
    results: StockSearchResult[];
    error: string | null;
  }>({ key: "", results: [], error: null });
  useEffect(() => {
    if (!enabled || !needle) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void searchStocks(needle, market, controller.signal)
        .then((results) => {
          if (!controller.signal.aborted)
            setState({ key, results, error: null });
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setState({
              key,
              results: [],
              error: "검색을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
            });
        });
    }, delay);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [needle, market, key, delay, enabled]);
  const current = enabled && !!needle && state.key === key;
  return {
    results: current ? state.results.slice(0, limit) : [],
    loading: enabled && !!needle && !current,
    error: current ? state.error : null,
  };
}
