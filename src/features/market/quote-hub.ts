import type { StockQuote } from "@/lib/types";
type QuoteState = {
  quote?: StockQuote;
  failed: boolean;
  checkedAt: number | null;
  refreshing: boolean;
  version: number;
  failures: number;
  nextAttemptAt: number;
  rateLimited: boolean;
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
const RECOVERY_DELAYS = [1_000, 2_000, 5_000];
const MAX_RETAINED_QUOTES = 256;
function transientFailure(error: unknown) {
  return error instanceof Error && (error.name === "TimeoutError" || error.cause === "network" ||
    (typeof error.cause === "number" && [408, 500, 502, 503, 504].includes(error.cause)));
}

/** One timer and one request per symbol, independent of the number of consumers. */
export function createQuoteHub(
  load: (symbol: string, signal: AbortSignal) => Promise<StockQuote>,
  interval = 30_000,
) {
  const states = new Map<string, QuoteState>();
  // Public quotes only, scoped to this browser module; never account data or persistent storage.
  const retained = new Map<string, QuoteState>();
  const subscribers = new Map<() => void, string[]>();
  const views = new Map<string, { version: string; value: QuoteView }>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const requests = new Map<string, AbortController>();
  let visible = true;
  const wanted = () => [...new Set([...subscribers.values()].flat())];
  const pruneRetained = () => {
    const now = Date.now();
    for (const [symbol, state] of retained) {
      // Normal prices expire at their original refresh deadline. Failures keep their
      // retry sequence briefly; a live provider cooldown must never be evicted early.
      const expiresAt = state.nextAttemptAt + (state.failed && !state.rateLimited ? interval : 0);
      if (expiresAt <= now) retained.delete(symbol);
    }
    let slots = MAX_RETAINED_QUOTES;
    for (const [symbol, state] of [...retained].reverse()) {
      if (slots-- > 0) continue;
      if (state.rateLimited) {
        // Retain only the small retry guard under pressure, not another quote payload.
        if (state.quote) retained.set(symbol, { ...state, quote: undefined, version: state.version + 1 });
      } else retained.delete(symbol);
    }
  };
  const emit = (symbols: string[]) => {
    for (const [listener, list] of subscribers)
      if (list.some((s) => symbols.includes(s))) listener();
  };
  const schedule = (ms: number) => {
    clearTimeout(timer);
    // Long provider cooldowns must not overflow setTimeout into an immediate retry.
    if (visible && subscribers.size) timer = setTimeout(() => void tick(), Math.min(ms, 2_147_483_647));
  };
  const scheduleNext = () => {
    const next = wanted().filter((symbol) => !requests.has(symbol)).map((symbol) => {
      return Math.max(0, (states.get(symbol)?.nextAttemptAt ?? 0) - Date.now());
    });
    clearTimeout(timer);
    if (next.length) schedule(Math.min(...next));
  };
  async function tick(force = false) {
    if (!visible || !subscribers.size) return;
    const symbols = wanted().filter(
      (s) =>
        !requests.has(s) && (!states.get(s)?.rateLimited ||
        (states.get(s)?.nextAttemptAt ?? 0) <= Date.now()) && (force ||
        (states.get(s)?.nextAttemptAt ?? 0) <= Date.now()),
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
        failures: old?.failures ?? 0,
        nextAttemptAt: old?.nextAttemptAt ?? 0,
        rateLimited: old?.rateLimited ?? false,
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
          if (current()) {
            const now = Date.now();
            const fetchedAt = Date.parse(quote.fetchedAt ?? "");
            const nextAttemptAt = Number.isFinite(fetchedAt) ? Math.min(now + interval, fetchedAt + interval) : now + interval;
            // Reusing a server/client cached response must not restart its freshness window.
            // A response can expire in transit. Recover through bounded backoff,
            // without accepting stale data or starting an immediate response loop.
            if (nextAttemptAt <= now) throw new Error("최근 시세 확인이 필요합니다.", { cause: 502 });
            states.set(symbol, {
              quote,
              failed: false,
              checkedAt: now,
              refreshing: false,
              version: (states.get(symbol)?.version ?? 0) + 1,
              failures: 0,
              nextAttemptAt,
              rateLimited: false,
            });
          }
        } catch (error) {
          if (current()) {
            const old = states.get(symbol)!;
            const failures = Math.min(old.failures + 1, RECOVERY_DELAYS.length + 1);
            const rateLimited = error instanceof Error && error.cause === 429;
            const retryAfterMs = (error as { retryAfterMs?: number } | null)?.retryAfterMs;
            const delay = rateLimited
              ? Math.max(interval, typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs) && retryAfterMs >= 0 ? retryAfterMs : 60_000)
              : Math.min(interval, transientFailure(error) ? RECOVERY_DELAYS[failures - 1] ?? interval : interval);
            const now = Date.now();
            states.set(symbol, {
              ...old,
              failed: true,
              checkedAt: now,
              refreshing: false,
              version: old.version + 1,
              failures,
              // Recover after the transport's own retry, without fast polling forever.
              nextAttemptAt: now + delay,
              rateLimited,
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
      pruneRetained();
      for (const symbol of symbols) {
        const state = retained.get(symbol);
        if (state && !states.has(symbol)) states.set(symbol, state);
        retained.delete(symbol);
      }
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
        for (const [symbol, state] of states) {
          if (keep.has(symbol)) continue;
          states.delete(symbol);
          if (state.checkedAt !== null) {
            retained.delete(symbol);
            retained.set(symbol, { ...state, refreshing: false, version: state.version + 1 });
          }
        }
        pruneRetained();
        views.clear();
        if (!subscribers.size) {
          clearTimeout(timer);
        } else {
          scheduleNext();
        }
      };
    },
    snapshot(symbols: string[]): QuoteView {
      if (!symbols.length) return EMPTY;
      // React reads the snapshot before subscribing, so expiry must also be checked here.
      pruneRetained();
      const key = symbols.join(",");
      const list = symbols.map((s) => states.get(s) ?? retained.get(s));
      const version = list.map((state) => state?.version ?? 0).join(",");
      const cached = views.get(key);
      if (cached?.version === version) return cached.value;
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
