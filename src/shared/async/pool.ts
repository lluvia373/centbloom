export function createPool(limit: number) {
  let running = 0;
  const waiting: Array<() => void> = [];
  return async function run<T>(
    action: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    if (signal?.aborted)
      throw signal.reason ?? new DOMException("Aborted", "AbortError");
    if (running >= limit)
      await new Promise<void>((resolve) => waiting.push(resolve));
    else running++;
    try {
      if (signal?.aborted)
        throw signal.reason ?? new DOMException("Aborted", "AbortError");
      return await action();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else running--;
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
