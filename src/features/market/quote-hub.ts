import type { StockQuote } from "@/lib/types";
type QuoteState = {
  quote?: StockQuote;
  failed: boolean;
  checkedAt: number | null;
  refreshing: boolean;
  version: number;
};
export interface QuoteView {
  quotes: Record<string, StockQuote>;
  failedSymbols: string[];
  checkedAt: number | null;
  loading: boolean;
  refreshing: boolean;
}
const EMPTY: QuoteView = {
  quotes: {},
  failedSymbols: [],
  checkedAt: null,
  loading: false,
  refreshing: false,
};

/** One timer and one request per symbol, independent of the number of consumers. */
export function createQuoteHub(
  load: (symbol: string, signal: AbortSignal) => Promise<StockQuote>,
  interval = 30_000,
) {
  const states = new Map<string, QuoteState>();
  const subscribers = new Map<() => void, string[]>();
  const views = new Map<string, { version: string; value: QuoteView }>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const requests = new Map<string, AbortController>();
  let visible = true;
  const wanted = () => [...new Set([...subscribers.values()].flat())];
  const emit = (symbols: string[]) => {
    for (const [listener, list] of subscribers)
      if (list.some((s) => symbols.includes(s))) listener();
  };
  const schedule = (ms: number) => {
    clearTimeout(timer);
    if (visible && subscribers.size) timer = setTimeout(() => void tick(), ms);
  };
  const scheduleNext = () => {
    const next = wanted().filter((symbol) => !requests.has(symbol)).map((symbol) => {
      const checkedAt = states.get(symbol)?.checkedAt;
      return checkedAt ? Math.max(0, interval - (Date.now() - checkedAt)) : 0;
    });
    clearTimeout(timer);
    if (next.length) schedule(Math.min(...next));
  };
  async function tick(force = false) {
    if (!visible || !subscribers.size) return;
    const symbols = wanted().filter(
      (s) =>
        !requests.has(s) && (force ||
        !states.get(s)?.checkedAt ||
        Date.now() - states.get(s)!.checkedAt! >= interval),
    );
    if (!symbols.length) {
      scheduleNext();
      return;
    }
    const pending = symbols.map((s) => {
      const controller = new AbortController();
      requests.set(s, controller);
      const old = states.get(s);
      states.set(s, {
        ...old,
        failed: old?.failed ?? false,
        checkedAt: old?.checkedAt ?? null,
        refreshing: true,
        version: (old?.version ?? 0) + 1,
      });
      return { symbol: s, controller };
    });
    emit(symbols);
    await Promise.all(
      pending.map(async ({ symbol, controller }) => {
        const current = () => !controller.signal.aborted && requests.get(symbol) === controller;
        try {
          controller.signal.throwIfAborted();
          const quote = await load(symbol, controller.signal);
          if (current())
            states.set(symbol, {
              quote,
              failed: false,
              checkedAt: Date.now(),
              refreshing: false,
              version: (states.get(symbol)?.version ?? 0) + 1,
            });
        } catch {
          if (current()) {
            const old = states.get(symbol)!;
            states.set(symbol, {
              ...old,
              failed: true,
              checkedAt: Date.now(),
              refreshing: false,
              version: old.version + 1,
            });
          }
        } finally {
          if (current()) {
            requests.delete(symbol);
            // New subscriptions and each quote's refresh interval remain independent.
            emit([symbol]);
            scheduleNext();
          }
        }
      }),
    );
  }
  return {
    subscribe(symbols: string[], listener: () => void) {
      subscribers.set(listener, symbols);
      schedule(0);
      return () => {
        subscribers.delete(listener);
        const keep = new Set(wanted());
        for (const [symbol, controller] of requests)
          if (!keep.has(symbol)) {
            requests.delete(symbol);
            controller.abort();
          }
        if (!subscribers.size) {
          clearTimeout(timer);
          states.clear();
          views.clear();
        } else {
          for (const symbol of states.keys())
            if (!keep.has(symbol)) states.delete(symbol);
          views.clear();
          scheduleNext();
        }
      };
    },
    snapshot(symbols: string[]): QuoteView {
      if (!symbols.length) return EMPTY;
      const key = symbols.join(",");
      const version = symbols.map((s) => states.get(s)?.version ?? 0).join(",");
      const cached = views.get(key);
      if (cached?.version === version) return cached.value;
      const list = symbols.map((s) => states.get(s));
      const quotes: Record<string, StockQuote> = {};
      symbols.forEach((s, i) => {
        if (list[i]?.quote) quotes[s] = list[i]!.quote!;
      });
      const checked = list.map((s) => s?.checkedAt ?? 0);
      const value = {
        quotes,
        failedSymbols: symbols.filter((_, i) => list[i]?.failed),
        checkedAt: checked.every(Boolean) ? Math.min(...checked) : null,
        loading: list.some((s) => !s?.checkedAt),
        refreshing: list.some((s) => !s || s.refreshing),
      };
      views.set(key, { version, value });
      return value;
    },
    refresh: () => tick(true),
    setVisible(value: boolean) {
      visible = value;
      clearTimeout(timer);
      if (value) schedule(0);
    },
    empty: EMPTY,
  };
}
