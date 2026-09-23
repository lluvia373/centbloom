"use client";
import { addCalendarDays } from "@/lib/performance";
import { getChartSeries } from "@/lib/stock-api";
import type { ChartSeries } from "@/lib/types";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { BenchmarkState } from "./benchmark-data";
import { createComparisonStore, selectedSymbols } from "./comparison-store";

/** Owns only this view's subscriptions; getChartSeries owns caching and the shared request queue. */
export function createBenchmarkSeriesStore() {
  const store = createComparisonStore<{ start: string; end: string }, ChartSeries>({
    subscribe(symbol, { start, end }, report) {
      const controller = new AbortController();
      void Promise.resolve()
        .then(() => controller.signal.aborted ? null :
          getChartSeries(symbol, addCalendarDays(start, -7), end, controller.signal))
        .then((series) => {
          if (series && !controller.signal.aborted)
            report({ symbol, series, loading: false, error: null });
        })
        .catch(() => {
          if (!controller.signal.aborted)
            report({ symbol, series: null, loading: false, error: "비교 자료를 불러오지 못했습니다." });
        });
      return () => controller.abort();
    },
  });
  return {
    ...store,
    select(symbols: readonly string[], nextStart: string, nextEnd: string) {
      store.select(symbols, nextStart && nextEnd ? { start: nextStart, end: nextEnd } : null,
        JSON.stringify([nextStart, nextEnd]));
    },
  };
}

export function useBenchmarkSeries(symbols: readonly string[], start: string, end: string) {
  const [store] = useState(createBenchmarkSeriesStore);
  const symbolsKey = JSON.stringify(selectedSymbols(symbols));
  const range = JSON.stringify([start, end]);
  const snapshot = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);

  useEffect(() => {
    store.select(JSON.parse(symbolsKey) as string[], start, end);
  }, [store, symbolsKey, start, end]);
  useEffect(() => () => store.dispose(), [store]);

  const benchmarks = useMemo(() => {
    if (!start || !end) return [];
    return (JSON.parse(symbolsKey) as string[]).map((symbol): BenchmarkState =>
      (snapshot.range === range ? snapshot.entries.get(symbol) : null) ??
      { symbol, series: null, loading: true, error: null },
    );
  }, [symbolsKey, start, end, range, snapshot]);
  return { benchmarks, retry: store.retry };
}
