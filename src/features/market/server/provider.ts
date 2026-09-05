import { createRequestCache } from "@/shared/async/request-cache";
import YahooFinance from "yahoo-finance2";
// One client/queue per server instance. No network work runs at module initialization.
export const yahoo = new YahooFinance({
  queue: { concurrency: 4 },
  fetch: (input, init) =>
    fetch(input, {
      ...init,
      signal: AbortSignal.any([
        ...(init?.signal ? [init.signal] : []),
        AbortSignal.timeout(15_000),
      ]),
    }),
});
export const providerRequests = createRequestCache({
  concurrency: 4,
  maxEntries: 256,
});
export class MarketError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}
export function validSymbol(symbol: string) {
  return /^[A-Za-z0-9.^=_-]{1,40}$/.test(symbol);
}
export function validDate(date: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) &&
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date
  );
}
