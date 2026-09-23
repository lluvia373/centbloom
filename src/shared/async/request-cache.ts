import { createPool } from "./pool";
type Options = {
  signal?: AbortSignal;
  ttlMs?: number;
  timeoutMs?: number;
  queueTimeoutMs?: number;
  priority?: "normal" | "interactive";
  retry?: { limit: number; delayMs: number; when: (error: unknown) => boolean; onRetry?: (error: unknown) => void };
};
interface Entry {
  promise: Promise<unknown>;
  controller: AbortController;
  users: number;
  completed: boolean;
  expires: number;
}

export function createRequestCache({
  concurrency = 6,
  maxEntries = 256,
  now = Date.now,
} = {}) {
  const entries = new Map<string, Entry>();
  const run = createPool(concurrency);
  function request<T>(
    key: string,
    loader: (signal: AbortSignal) => Promise<T>,
    { signal, ttlMs = 0, timeoutMs = 20_000, queueTimeoutMs = 60_000, priority = "normal", retry }: Options = {},
  ): Promise<T> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    let entry = entries.get(key);
    if (entry?.completed && entry.expires <= now()) {
      entries.delete(key);
      entry = undefined;
    }
    if (!entry) {
      const controller = new AbortController();
      entry = {
        controller,
        users: 0,
        completed: false,
        expires: 0,
        promise: Promise.resolve(),
      };
      const owned = entry;
      const attempt = async () => {
        controller.signal.throwIfAborted();
        const current = new AbortController();
        const cancel = () => current.abort(controller.signal.reason);
        controller.signal.addEventListener("abort", cancel, { once: true });
        // Queue wait and network work each have a bounded, independent budget.
        let timer = setTimeout(() => current.abort(
          new DOMException("조회 요청이 많아 대기 시간이 초과되었습니다.", "TimeoutError"),
        ), queueTimeoutMs);
        const aborted = new Promise<never>((_, reject) =>
          current.signal.addEventListener("abort", () => reject(current.signal.reason), { once: true }),
        );
        try {
          return await Promise.race([
            run(() => {
              clearTimeout(timer);
              timer = setTimeout(() => current.abort(
                new DOMException("요청 시간이 초과되었습니다.", "TimeoutError"),
              ), timeoutMs);
              return Promise.race([Promise.resolve().then(() => loader(current.signal)), aborted]);
            }, current.signal, priority),
            aborted,
          ]);
        } finally {
          clearTimeout(timer);
          controller.signal.removeEventListener("abort", cancel);
        }
      };
      const load = async () => {
        for (let failures = 0; ; failures++) {
          try { return await attempt(); }
          catch (error) {
            controller.signal.throwIfAborted();
            if (!retry || failures >= retry.limit || !retry.when(error)) throw error;
            retry.onRetry?.(error);
            await delay(retry.delayMs, controller.signal);
          }
        }
      };
      owned.promise = load()
        .then((value) => {
          if (controller.signal.aborted) throw controller.signal.reason;
          owned.completed = true;
          owned.expires = now() + ttlMs;
          return value;
        })
        .catch((error) => {
          if (entries.get(key) === owned) entries.delete(key);
          throw error;
        });
      entries.set(key, owned);
      for (const [oldKey, old] of entries) {
        if (entries.size <= maxEntries) break;
        if (old.completed && old.users === 0) entries.delete(oldKey);
      }
    }
    const owned = entry;
    owned.users++;
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener("abort", abort);
        owned.users--;
        if (!owned.completed && owned.users === 0) {
          if (entries.get(key) === owned) entries.delete(key);
          owned.controller.abort(
            new DOMException("No subscribers", "AbortError"),
          );
        }
        fn();
      };
      const abort = () =>
        finish(() =>
          reject(signal?.reason ?? new DOMException("Aborted", "AbortError")),
        );
      signal?.addEventListener("abort", abort, { once: true });
      owned.promise.then(
        (value) => finish(() => resolve(value as T)),
        (error) => finish(() => reject(error)),
      );
    });
  }
  return {
    request,
    invalidate(prefix = "") {
      for (const [key, e] of entries)
        if (key.startsWith(prefix) && e.completed) entries.delete(key);
    },
    size: () => entries.size,
  };
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, ms);
    const cancel = () => { clearTimeout(timer); reject(signal.reason); };
    signal.addEventListener("abort", cancel, { once: true });
  });
}
