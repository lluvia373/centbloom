import type { BuildPerformanceInput } from "@/lib/performance";
import { buildDailyPerformance } from "@/lib/performance";
import type { PortfolioPerformancePoint } from "@/lib/types";

export function calculateHistory(
  input: BuildPerformanceInput,
  signal: AbortSignal,
): Promise<PortfolioPerformancePoint[]> {
  if (typeof Worker === "undefined" || input.transactions.length < 5000)
    return Promise.resolve().then(() => {
      signal.throwIfAborted();
      return buildDailyPerformance(input);
    });
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./performance.worker.ts", import.meta.url),
    );
    const cleanup = () => {
      worker.terminate();
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(signal.reason);
    };
    worker.onmessage = ({ data }) => {
      cleanup();
      if (data.error) reject(new Error(data.error));
      else resolve(data.points);
    };
    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message));
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    else worker.postMessage(input);
  });
}
