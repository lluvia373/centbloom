import type { StockQuote } from "@/lib/types";
import type { QuoteBatchResult } from "../quote-batch";
import { fxPair } from "../fx";

export interface PreparedQuoteDemand { symbol: string; lastSeen: number }
export interface PreparedQuoteOptions {
  load: (symbols: string[], signal: AbortSignal) => Promise<QuoteBatchResult>;
  now?: () => number;
  freshnessMs?: number;
  demandMs?: number;
  maxEntries?: number;
  maxPrepared?: number;
}
type RowError = QuoteBatchResult["errors"][string];
type Outcome = { quote: StockQuote } | { error: RowError };
type Waiter = { resolve: (value: Outcome) => void; reject: (error: unknown) => void; cleanup: () => void };
type Entry = { symbol: string; waiters: Set<Waiter>; group?: Group };
type Group = { controller: AbortController; members: Set<Entry> };
type Saved = { quote?: StockQuote; prepareAt: number };

const symbolPattern = /^[A-Z0-9.^=_-]{1,40}$/;
function validSymbol(symbol: unknown): symbol is string {
  return typeof symbol === "string" && symbolPattern.test(symbol) &&
    (!symbol.endsWith("=X") || fxPair(symbol) !== null);
}
function failure(message: string, status = 502): RowError { return { message, status }; }
function rateLimited(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as { status?: unknown; code?: unknown; cause?: unknown; message?: unknown };
  return [value.status, value.code, value.cause].includes(429) ||
    (typeof value.message === "string" && /\bstatus[: ]+429\b/i.test(value.message));
}

/** Public quotes only. The caller owns all scheduling, persistence and network I/O. */
export function createPreparedQuotes({
  load, now = Date.now, freshnessMs = 30_000, demandMs = 5 * 60_000,
  maxEntries = 256, maxPrepared = 50,
}: PreparedQuoteOptions) {
  if (![freshnessMs, demandMs, maxEntries, maxPrepared].every(value => Number.isFinite(value) && value > 0))
    throw new RangeError("Prepared quote limits must be positive finite numbers");
  maxEntries = Math.max(1, Math.floor(maxEntries));
  maxPrepared = Math.min(50, Math.max(1, Math.floor(maxPrepared)));
  const saved = new Map<string, Saved>();
  const demand = new Map<string, number>();
  const inflight = new Map<string, Entry>();
  let blockedUntil = 0;
  let blockedEndpoint: unknown;

  const quoteTime = (quote: StockQuote) => Date.parse(quote.fetchedAt ?? "");
  const fresh = (quote: StockQuote, symbol: string, at = now()) =>
    quote.symbol === symbol && Number.isFinite(quote.price) && quote.price > 0 &&
    /^(?:[A-Z]{3}|GBp)$/.test(quote.currency) && Number.isFinite(quoteTime(quote)) &&
    quoteTime(quote) <= at && at - quoteTime(quote) < freshnessMs;
  const trim = () => {
    const at = now();
    for (const [symbol, lastSeen] of demand)
      if (lastSeen > at || at - lastSeen >= demandMs) demand.delete(symbol);
    for (const [symbol, state] of saved)
      if (!inflight.has(symbol) && state.prepareAt <= at && !demand.has(symbol)) saved.delete(symbol);
    while (saved.size > maxEntries) saved.delete(saved.keys().next().value!);
    if (demand.size > maxEntries) {
      const oldest = [...demand].sort((a, b) => a[1] - b[1]);
      for (const [symbol] of oldest.slice(0, demand.size - maxEntries)) demand.delete(symbol);
    }
  };
  const save = (symbol: string, state: Saved) => {
    saved.delete(symbol);
    saved.set(symbol, state);
    trim();
  };
  const rememberLimit = (error: unknown) => {
    if (!rateLimited(error)) return;
    const value = error as { retryAfterSeconds?: unknown; providerEndpoint?: unknown };
    const seconds = typeof value.retryAfterSeconds === "number" && Number.isFinite(value.retryAfterSeconds) && value.retryAfterSeconds > 0
      ? Math.ceil(value.retryAfterSeconds) : 60;
    blockedUntil = Math.max(blockedUntil, now() + Math.min(seconds * 1000, Number.MAX_SAFE_INTEGER - now()));
    blockedEndpoint = value.providerEndpoint;
  };
  const blockedError = () => Object.assign(new Error("시장 데이터 공급처의 조회 제한으로 잠시 기다려 주세요."), {
    status: 429, retryAfterSeconds: Math.max(1, Math.ceil((blockedUntil - now()) / 1000)),
    ...(typeof blockedEndpoint === "string" ? { providerEndpoint: blockedEndpoint } : {}),
  });
  const settle = (entry: Entry, outcome?: Outcome, error?: unknown) => {
    // An abandoned request must neither publish a late value nor replace a newer job.
    if (inflight.get(entry.symbol) !== entry || !entry.waiters.size) return;
    inflight.delete(entry.symbol);
    entry.group?.members.delete(entry);
    if (outcome && "quote" in outcome) save(entry.symbol, {
      quote: outcome.quote, prepareAt: Math.max(
        quoteTime(outcome.quote) + Math.max(1_000, freshnessMs - 5_000), now() + 5_000,
      ),
    });
    else save(entry.symbol, { prepareAt: now() + freshnessMs });
    for (const waiter of entry.waiters) {
      waiter.cleanup();
      if (outcome) waiter.resolve(outcome);
      else waiter.reject(error);
    }
    entry.waiters.clear();
  };
  const dispatch = (entries: Entry[]) => {
    for (let start = 0; start < entries.length; start += 50) {
      const members = entries.slice(start, start + 50);
      const group: Group = { controller: new AbortController(), members: new Set(members) };
      for (const entry of members) entry.group = group;
      void Promise.resolve().then(() => {
        group.controller.signal.throwIfAborted();
        if (blockedUntil > now()) throw blockedError();
        return load(members.map(entry => entry.symbol), group.controller.signal);
      }).then(result => {
        if (group.controller.signal.aborted) return;
        for (const entry of members) {
          if (inflight.get(entry.symbol) !== entry || !entry.waiters.size) continue;
          const quote = result?.quotes?.[entry.symbol], error = result?.errors?.[entry.symbol];
          if (error) rememberLimit(error);
          if (quote && !error && fresh(quote, entry.symbol)) settle(entry, { quote });
          else settle(entry, { error: !quote && error && typeof error.message === "string" &&
            Number.isInteger(error.status) && error.status >= 400 && error.status <= 599
            ? error : failure(`${entry.symbol}의 유효한 최신 시세를 확인하지 못했습니다.`) });
        }
      }, error => {
        if (group.controller.signal.aborted) return;
        rememberLimit(error);
        for (const entry of members) settle(entry, undefined, error);
      });
    }
  };
  const subscribe = (entry: Entry, signal: AbortSignal) => new Promise<Outcome>((resolve, reject) => {
    const abort = () => {
      entry.waiters.delete(waiter);
      waiter.cleanup();
      reject(signal.reason);
      if (!entry.waiters.size) {
        if (inflight.get(entry.symbol) === entry) inflight.delete(entry.symbol);
        entry.group?.members.delete(entry);
        if (entry.group && !entry.group.members.size) entry.group.controller.abort(signal.reason);
      }
    };
    const waiter: Waiter = { resolve, reject, cleanup: () => signal.removeEventListener("abort", abort) };
    entry.waiters.add(waiter);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
  const collect = async (raw: string[], signal: AbortSignal | undefined, refresh: boolean, markDemand: boolean): Promise<QuoteBatchResult> => {
    signal?.throwIfAborted();
    const symbols = [...new Set(raw.map(symbol => typeof symbol === "string" ? symbol.trim().toUpperCase() : ""))];
    if (symbols.some(symbol => !validSymbol(symbol)))
      throw Object.assign(new Error("유효한 공개 시세 종목이 필요합니다."), { status: 400 });
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", abort, { once: true });
    const created: Entry[] = [];
    const requestedAt = now();
    if (markDemand) for (const symbol of symbols) demand.set(symbol, requestedAt);
    trim();
    try {
      const pending = symbols.map(symbol => {
        const state = saved.get(symbol);
        if (!refresh && state?.quote && fresh(state.quote, symbol)) return Promise.resolve<Outcome>({ quote: state.quote });
        // Once a refresh is necessary, an old value cannot become eligible again.
        if (state?.quote && !fresh(state.quote, symbol)) save(symbol, { prepareAt: state.prepareAt });
        let entry = inflight.get(symbol);
        if (!entry) {
          if (blockedUntil > now()) return Promise.reject<Outcome>(blockedError());
          entry = { symbol, waiters: new Set() };
          inflight.set(symbol, entry);
          created.push(entry);
        }
        return subscribe(entry, controller.signal);
      });
      dispatch(created);
      const outcomes = await Promise.all(pending);
      controller.signal.throwIfAborted();
      const result: QuoteBatchResult = { quotes: {}, errors: {} };
      outcomes.forEach((outcome, index) => {
        const symbol = symbols[index];
        if ("quote" in outcome && fresh(outcome.quote, symbol)) result.quotes[symbol] = outcome.quote;
        else result.errors[symbol] = "error" in outcome ? outcome.error : failure(`${symbol} 시세의 조회 유효시간이 지났습니다.`);
      });
      return result;
    } catch (error) {
      controller.abort(error);
      throw error;
    } finally { signal?.removeEventListener("abort", abort); }
  };
  const preparationDemand = () => {
    trim();
    return [...demand].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, maxPrepared);
  };
  return {
    read: (symbols: string[], signal?: AbortSignal) => collect(symbols, signal, false, true),
    prepare: () => collect(preparationDemand()
      .filter(([symbol]) => (saved.get(symbol)?.prepareAt ?? 0) <= now())
      .map(([symbol]) => symbol), undefined, true, false),
    demandSnapshot(): PreparedQuoteDemand[] {
      trim();
      return [...demand].map(([symbol, lastSeen]) => ({ symbol, lastSeen }));
    },
    restoreDemand(list: PreparedQuoteDemand[]) {
      const at = now();
      for (const item of list) if (item && validSymbol(item.symbol) && Number.isFinite(item.lastSeen) &&
        item.lastSeen >= 0 && item.lastSeen <= at && at - item.lastSeen < demandMs)
        demand.set(item.symbol, Math.max(demand.get(item.symbol) ?? 0, item.lastSeen));
      trim();
    },
    nextPreparationAt(): number | null {
      const at = now();
      const dates = preparationDemand().filter(([symbol]) => !inflight.has(symbol)).map(([symbol, lastSeen]) => ({
        at: Math.max(at, blockedUntil, saved.get(symbol)?.prepareAt ?? at), expires: lastSeen + demandMs,
      })).filter(value => value.at < value.expires);
      return dates.length ? Math.min(...dates.map(value => value.at)) : null;
    },
  };
}
