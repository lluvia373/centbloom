import { createPool } from "./pool";
type Options = { signal?: AbortSignal; ttlMs?: number; timeoutMs?: number };
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
    { signal, ttlMs = 0, timeoutMs = 20_000 }: Options = {},
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
      const timer = setTimeout(
        () =>
          controller.abort(
            new DOMException("요청 시간이 초과되었습니다.", "TimeoutError"),
          ),
        timeoutMs,
      );
      const aborted = new Promise<never>((_, reject) =>
        controller.signal.addEventListener(
          "abort",
          () => reject(controller.signal.reason),
          { once: true },
        ),
      );
      owned.promise = Promise.race([
        run(
          () => Promise.race([Promise.resolve().then(() => loader(controller.signal)), aborted]),
          controller.signal,
        ),
        aborted,
      ])
        .then((value) => {
          if (controller.signal.aborted) throw controller.signal.reason;
          owned.completed = true;
          owned.expires = now() + ttlMs;
          return value;
        })
        .catch((error) => {
          if (entries.get(key) === owned) entries.delete(key);
          throw error;
        })
        .finally(() => clearTimeout(timer));
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
