export function createPool(limit: number) {
  let running = 0;
  let interactiveStreak = 0;
  const waiting: Array<{ enter: () => void; priority: "normal" | "interactive" }> = [];
  return async function run<T>(
    action: () => Promise<T>,
    signal?: AbortSignal,
    priority: "normal" | "interactive" = "normal",
  ): Promise<T> {
    if (signal?.aborted)
      throw signal.reason ?? new DOMException("Aborted", "AbortError");
    if (running >= limit)
      await new Promise<void>((resolve, reject) => {
        const enter = () => {
          signal?.removeEventListener("abort", abort);
          resolve();
        };
        const abort = () => {
          const index = waiting.findIndex((item) => item.enter === enter);
          if (index !== -1) waiting.splice(index, 1);
          reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
        };
        waiting.push({ enter, priority });
        signal?.addEventListener("abort", abort, { once: true });
      });
    else running++;
    try {
      if (signal?.aborted)
        throw signal.reason ?? new DOMException("Aborted", "AbortError");
      return await action();
    } finally {
      const interactive = waiting.findIndex((item) => item.priority === "interactive");
      const normal = waiting.findIndex((item) => item.priority === "normal");
      // Search takes the next free slot, without cancelling active work or
      // starving normal requests when users keep typing.
      const index = interactive !== -1 && (interactiveStreak < 3 || normal === -1)
        ? interactive : normal;
      const next = index === -1 ? undefined : waiting.splice(index, 1)[0];
      if (next) {
        interactiveStreak = next.priority === "interactive" ? interactiveStreak + 1 : 0;
        next.enter();
      } else {
        interactiveStreak = 0;
        running--;
      }
    }
  };
}
export async function mapLimited<T, R>(
  values: readonly T[],
  limit: number,
  fn: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const result = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, async () => {
      while (cursor < values.length) {
        const index = cursor++;
        result[index] = await fn(values[index], index);
      }
    }),
  );
  return result;
}
