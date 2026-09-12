/** A cold prepared feed responds with 202; wait without occupying the quote request pool. */
export async function fetchPreparedFeed<T>(url: string, signal: AbortSignal, request: typeof fetch = fetch): Promise<T> {
  for (;;) {
    signal.throwIfAborted();
    const response = await request(url, { signal, cache: "default" });
    if (response.status !== 202) {
      if (!response.ok) throw new Error("Prepared feed unavailable");
      return response.json() as Promise<T>;
    }
    await new Promise<void>((resolve, reject) => {
      const finish = () => { signal.removeEventListener("abort", abort); resolve(); };
      const timer = setTimeout(finish, 2_000);
      const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(signal.reason); };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
  }
}
