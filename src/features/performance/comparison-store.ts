export type ComparisonState<T> = {
  symbol: string;
  series: T | null;
  loading: boolean;
  error: string | null;
};

type Source<I, T> = {
  subscribe(symbol: string, input: I, report: (state: ComparisonState<T>) => void): () => void;
  retry?(symbol: string, input: I): void;
};

export function selectedSymbols(symbols: readonly string[]): string[] {
  return [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
}

/** One selection owns only its own subscriptions, not another view's public data. */
export function createComparisonStore<I, T>(source: Source<I, T>) {
  let range = "";
  let input: I | null = null;
  const entries = new Map<string, ComparisonState<T>>();
  const subscriptions = new Map<string, { stop?: () => void }>();
  const listeners = new Set<() => void>();
  let snapshot = { range, entries: new Map(entries) as ReadonlyMap<string, ComparisonState<T>> };
  const publish = () => {
    snapshot = { range, entries: new Map(entries) };
    listeners.forEach((listener) => listener());
  };
  const cancel = (symbol: string) => {
    const subscription = subscriptions.get(symbol);
    subscriptions.delete(symbol);
    subscription?.stop?.();
  };
  const load = (symbol: string, selected: I) => {
    const subscription: { stop?: () => void } = {};
    subscriptions.set(symbol, subscription);
    entries.set(symbol, { symbol, series: null, loading: true, error: null });
    subscription.stop = source.subscribe(symbol, selected, (state) => {
      if (subscriptions.get(symbol) !== subscription) return;
      entries.set(symbol, state);
      publish();
    });
  };
  return {
    snapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    select(symbols: readonly string[], nextInput: I | null, nextRange: string) {
      const selected = new Set(nextInput === null ? [] : selectedSymbols(symbols));
      let changed = nextRange !== range;
      for (const symbol of entries.keys()) {
        if (changed || !selected.has(symbol)) {
          cancel(symbol);
          entries.delete(symbol);
        }
      }
      input = nextInput;
      range = nextRange;
      if (nextInput !== null) for (const symbol of selected) {
        if (!entries.has(symbol)) {
          load(symbol, nextInput);
          changed = true;
        }
      }
      if (changed || snapshot.entries.size !== entries.size) publish();
    },
    retry(symbol: string) {
      const entry = entries.get(symbol);
      if (!entry || entry.loading || input === null) return;
      if (source.retry) source.retry(symbol, input);
      else {
        cancel(symbol);
        load(symbol, input);
        publish();
      }
    },
    dispose() {
      for (const symbol of subscriptions.keys()) cancel(symbol);
      entries.clear();
      publish();
    },
  };
}
