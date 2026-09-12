import { applyWatchlistCommand, type WatchlistCommand, type WatchlistItem } from "./model";
import type { WatchlistRepository } from "./repository";

export interface WatchlistSnapshot {
  items: WatchlistItem[];
  ready: boolean;
  pending: boolean;
  refreshing: boolean;
  error: string | null;
}
export const EMPTY_WATCHLIST: WatchlistSnapshot = { items: [], ready: false, pending: false, refreshing: false, error: null };
const CANCELLED = "계정이 변경되어 요청을 중단했습니다.";
const failureMessage = (error: unknown, fallback: string) => error instanceof Error
  ? ["TimeoutError", "AbortError"].includes(error.name) ? "연결이 지연되고 있습니다. 다시 시도해 주세요." : error.message
  : fallback;

export function createWatchlistStore(repository: WatchlistRepository) {
  let snapshot: WatchlistSnapshot = EMPTY_WATCHLIST;
  let disposed = false;
  let tail: Promise<unknown> = Promise.resolve();
  let refreshing: Promise<void> | null = null;
  let pendingCount = 0;
  const listeners = new Set<() => void>();
  const controller = new AbortController();
  // Retain one ambiguous request ID until a confirmed retry; no automatic write replay.
  let uncertain: { key: string; requestId: string; command: WatchlistCommand } | null = null;
  const publish = (patch: Partial<WatchlistSnapshot>) => {
    if (disposed) return;
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((listener) => listener());
  };
  const enqueue = <T,>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task, task);
    tail = run.then(() => undefined, () => undefined);
    return run;
  };
  const refresh = (): Promise<void> => {
    if (disposed) return Promise.resolve();
    if (refreshing) return refreshing;
    refreshing = enqueue(async () => {
      if (disposed) return;
      publish({ refreshing: true });
      try {
        const value = await repository.read(AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]));
        publish({ items: value.items, ready: true, error: value.warning ?? null });
      } catch (error) {
        publish({ ready: true, error: failureMessage(error, "관심종목을 불러오지 못했습니다. 다시 시도해 주세요.") });
      } finally { publish({ refreshing: false }); }
    }).finally(() => { refreshing = null; });
    return refreshing;
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    refresh,
    async execute(command: WatchlistCommand): Promise<string | null> {
      if (disposed) return CANCELLED;
      if (!snapshot.ready) return "관심종목을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.";
      pendingCount++;
      publish({ pending: true });
      return enqueue(async () => {
        if (disposed) return CANCELLED;
        const commandKey = JSON.stringify(command.operation === "add"
          ? { ...command, payload: { ...command.payload, addedAt: undefined } } : command);
        try {
          // Validate against the last confirmed state, never replace the server list.
          applyWatchlistCommand(snapshot.items, command);
          const retry = uncertain?.key === commandKey ? uncertain : null;
          const requestId = retry?.requestId ?? crypto.randomUUID();
          const payload = retry?.command ?? command;
          uncertain = { key: commandKey, requestId, command: payload };
          const value = await repository.commit(payload, requestId, AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]));
          if (disposed) return CANCELLED;
          uncertain = null;
          publish({ items: value.items, error: value.warning ?? null });
          return null;
        } catch (error) {
          const message = disposed ? CANCELLED : failureMessage(error, "저장하지 못했습니다. 다시 시도해 주세요.");
          publish({ error: message });
          return message;
        } finally {
          pendingCount--;
          publish({ pending: pendingCount > 0 });
        }
      });
    },
    dispose() {
      disposed = true;
      controller.abort(new DOMException(CANCELLED, "AbortError"));
      snapshot = EMPTY_WATCHLIST;
      listeners.forEach((listener) => listener());
      listeners.clear();
    },
  };
}
