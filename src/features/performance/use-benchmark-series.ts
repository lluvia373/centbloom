"use client";
import { addCalendarDays } from "@/lib/performance";
import { getChartSeries } from "@/lib/stock-api";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { BenchmarkState } from "./benchmark-data";

type BenchmarkSnapshot = {
  range: string;
  entries: ReadonlyMap<string, BenchmarkState>;
};

function selectedSymbols(symbols: readonly string[]): string[] {
  return [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
}

/** Owns only this view's subscriptions; getChartSeries owns caching and the shared request queue. */
export function createBenchmarkSeriesStore() {
  let start = "";
  let end = "";
  let range = "";
  const entries = new Map<string, BenchmarkState>();
  const requests = new Map<string, AbortController>();
  const listeners = new Set<() => void>();
  let snapshot: BenchmarkSnapshot = { range, entries: new Map() };
  const publish = () => {
    snapshot = { range, entries: new Map(entries) };
    listeners.forEach((listener) => listener());
  };
  const cancel = (symbol: string) => {
    requests.get(symbol)?.abort();
    requests.delete(symbol);
  };
  const load = (symbol: string) => {
    const controller = new AbortController();
    requests.set(symbol, controller);
    entries.set(symbol, { symbol, series: null, loading: true, error: null });
    const requestStart = addCalendarDays(start, -7);
    const requestEnd = end;
    // Do not recreate other subscriptions when a target is added or retried.
    void Promise.resolve()
      .then(() => {
        if (controller.signal.aborted) return null;
        return getChartSeries(symbol, requestStart, requestEnd, controller.signal);
      })
      .then((series) => {
        if (!series || controller.signal.aborted || requests.get(symbol) !== controller) return;
        requests.delete(symbol);
        entries.set(symbol, { symbol, series, loading: false, error: null });
        publish();
      })
      .catch(() => {
        if (controller.signal.aborted || requests.get(symbol) !== controller) return;
        requests.delete(symbol);
        entries.set(symbol, {
          symbol,
          series: null,
          loading: false,
          error: "비교 자료를 불러오지 못했습니다.",
        });
        publish();
      });
  };
  return {
    snapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    select(symbols: readonly string[], nextStart: string, nextEnd: string) {
      const nextRange = JSON.stringify([nextStart, nextEnd]);
      const selected = new Set(nextStart && nextEnd ? selectedSymbols(symbols) : []);
      let changed = nextRange !== range;
      for (const symbol of entries.keys()) {
        if (changed || !selected.has(symbol)) {
          cancel(symbol);
          entries.delete(symbol);
        }
      }
      start = nextStart;
      end = nextEnd;
      range = nextRange;
      for (const symbol of selected) {
        if (!entries.has(symbol)) {
          load(symbol);
          changed = true;
        }
      }
      // A removal can change the visible state without adding a request.
      if (changed || snapshot.entries.size !== entries.size) publish();
    },
    retry(symbol: string) {
      const entry = entries.get(symbol);
      if (!entry || entry.loading || !start || !end) return;
      load(symbol);
      publish();
    },
    dispose() {
      for (const symbol of requests.keys()) cancel(symbol);
      entries.clear();
      publish();
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
