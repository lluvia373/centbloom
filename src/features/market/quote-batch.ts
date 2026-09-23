import type { StockQuote } from "@/lib/types";

export interface QuoteBatchResult {
  quotes: Record<string, StockQuote>;
  errors: Record<string, { message: string; status: number }>;
}

/** Dispatch only: caching and polling remain owned by marketRequests and the quote hub. */
export function createQuoteBatch(
  loadBatch: (symbols: string[], signal: AbortSignal) => Promise<QuoteBatchResult>,
  loadSingle: (symbol: string, signal: AbortSignal) => Promise<StockQuote>,
) {
  type Waiter = { resolve: (quote: StockQuote) => void; reject: (error: unknown) => void; cleanup: () => void };
  type Group = { controller: AbortController; members: Set<Entry> };
  type Entry = { symbol: string; waiters: Set<Waiter>; group?: Group };
  const entries = new Map<string, Entry>();
  const pending = new Set<Entry>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const settle = (entry: Entry, quote?: StockQuote, error?: unknown) => {
    if (entries.get(entry.symbol) === entry) entries.delete(entry.symbol);
    entry.group?.members.delete(entry);
    for (const waiter of entry.waiters) {
      waiter.cleanup();
      if (quote) waiter.resolve(quote);
      else waiter.reject(error);
    }
    entry.waiters.clear();
  };
  const flush = () => {
    timer = undefined;
    const queued = [...pending];
    pending.clear();
    for (let start = 0; start < queued.length; start += 50) {
      const members = queued.slice(start, start + 50).filter(entry => entry.waiters.size);
      if (!members.length) continue;
      const group: Group = { controller: new AbortController(), members: new Set(members) };
      for (const entry of members) entry.group = group;
      void Promise.resolve().then(() => {
        group.controller.signal.throwIfAborted();
        return loadBatch(members.map(entry => entry.symbol), group.controller.signal);
      }).then(result => {
        for (const entry of members) {
          const quote = result.quotes[entry.symbol], error = result.errors[entry.symbol];
          settle(entry, quote, new Error(error?.message ?? "묶음 시세 응답에 종목이 없습니다.", { cause: error?.status ?? 502 }));
        }
      }, error => {
        for (const entry of members) settle(entry, undefined, error);
      });
    }
  };

  return (symbol: string, signal: AbortSignal): Promise<StockQuote> => {
    if (signal.aborted) return Promise.reject(signal.reason);
    if (symbol.endsWith("=X")) return loadSingle(symbol, signal);
    let entry = entries.get(symbol);
    if (!entry) {
      entry = { symbol, waiters: new Set() };
      entries.set(symbol, entry);
      pending.add(entry);
    }
    const owned = entry;
    return new Promise((resolve, reject) => {
      const abort = () => {
        owned.waiters.delete(waiter);
        waiter.cleanup();
        reject(signal.reason);
        if (!owned.waiters.size) {
          if (entries.get(symbol) === owned) entries.delete(symbol);
          pending.delete(owned);
          const group = owned.group;
          group?.members.delete(owned);
          if (group && !group.members.size) group.controller.abort(signal.reason);
          if (!pending.size) { clearTimeout(timer); timer = undefined; }
        }
      };
      const waiter: Waiter = { resolve, reject, cleanup: () => signal.removeEventListener("abort", abort) };
      owned.waiters.add(waiter);
      signal.addEventListener("abort", abort, { once: true });
      if (!owned.group && timer === undefined) timer = setTimeout(flush, 0);
    });
  };
}
