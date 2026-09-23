"use client";
import type { IntradayRange, IntradaySeries } from "@/features/market/intraday";
import { getIntradaySeries } from "@/lib/stock-api";
import { createSharedResource } from "@/shared/async/shared-resource";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createComparisonStore, selectedSymbols, type ComparisonState } from "./comparison-store";

type Selection = { range: IntradayRange; day: string };
type Input = Selection & { symbol: string };
export type IntradayBenchmarkState = ComparisonState<IntradaySeries>;

const resourceKey = (symbol: string, { range, day }: Selection) => JSON.stringify([symbol, range, day]);
// Public prices only: no account/holding data is kept in this shared resource.
const resource = createSharedResource<Input, IntradaySeries | null>(
  ({ symbol, range, day }, signal) => getIntradaySeries(symbol, range, day, signal),
  null,
  60_000,
);

export function createIntradayBenchmarkStore() {
  const store = createComparisonStore<Selection, IntradaySeries>({
    subscribe(symbol, input, report) {
      const key = resourceKey(symbol, input);
      const update = () => {
        const state = resource.snapshot(key);
        report({ symbol, series: state.value, loading: state.loading, error: state.error });
      };
      const stop = resource.subscribe(key, { symbol, ...input }, update);
      update();
      return stop;
    },
    retry(symbol, input) { resource.retry(resourceKey(symbol, input)); },
  });
  return {
    ...store,
    select(symbols: readonly string[], range: IntradayRange, day: string) {
      store.select(symbols, day ? { range, day } : null, JSON.stringify([range, day]));
    },
  };
}

export function useIntradayBenchmarks(symbols: readonly string[], range: IntradayRange, day: string) {
  const [store] = useState(createIntradayBenchmarkStore);
  const symbolsKey = JSON.stringify(selectedSymbols(symbols));
  const rangeKey = JSON.stringify([range, day]);
  const snapshot = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);

  useEffect(() => {
    store.select(JSON.parse(symbolsKey) as string[], range, day);
  }, [store, symbolsKey, range, day]);
  useEffect(() => () => store.dispose(), [store]);

  const benchmarks = useMemo(() => {
    if (!day) return [];
    return (JSON.parse(symbolsKey) as string[]).map((symbol): IntradayBenchmarkState =>
      (snapshot.range === rangeKey ? snapshot.entries.get(symbol) : null) ??
      { symbol, series: null, loading: true, error: null },
    );
  }, [symbolsKey, day, rangeKey, snapshot]);
  return { benchmarks, retry: store.retry };
}
