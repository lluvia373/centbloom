import {
  normalizeMovers,
  MOVERS_CACHE_MS,
  type MoverKind,
  type MoversResult,
} from "../movers-model";
import { MarketError, providerRequests, yahoo } from "./provider";
const screens = {
  gainers: "day_gainers",
  losers: "day_losers",
  active: "most_actives",
} as const;
export function fetchMovers(
  kind: MoverKind,
  signal?: AbortSignal,
): Promise<MoversResult> {
  return providerRequests.request(
    "movers:us:" + kind,
    async (signal) => {
      const data = await yahoo.screener(
        { scrIds: screens[kind], count: 10 },
        undefined,
        { fetchOptions: { signal } },
      );
      const quotes = normalizeMovers(data.quotes, kind);
      if (data.quotes.length && !quotes.length)
        throw new MarketError("순위 시세를 확인할 수 없습니다.", 502);
      return {
        kind,
        quotes,
        total: data.total,
        fetchedAt: new Date().toISOString(),
      };
    },
    { signal, ttlMs: MOVERS_CACHE_MS },
  );
}
