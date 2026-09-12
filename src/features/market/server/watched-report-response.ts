import { getCloudflareContext } from "@opennextjs/cloudflare";
import { after, connection } from "next/server";
import { cache } from "react";
import { MarketError } from "./provider";
import { watchedSymbol } from "./watched-report-quote";
import { refreshWatchedReport } from "./watched-report-refresh";
import { readPreparedWatchedReport, watchedFailureKey } from "./watched-report-store";

/** Public responses read prepared data; provider work starts only after the response. */
export const readWatchedReport = cache(async (value: string) => {
  const symbol = watchedSymbol(value);
  await connection();
  const { env } = await getCloudflareContext({ async: true });
  if (!env.NEWS_CACHE) throw new Error("Stock research storage unavailable");
  const snapshot = await readPreparedWatchedReport(env.NEWS_CACHE, symbol);
  after(async () => {
    try { await refreshWatchedReport(env, symbol, { recordDemand: true, timeoutMs: 25_000 }); }
    catch { console.warn("watched_report_refresh_failed", { symbol }); }
  });
  if (snapshot) return snapshot.report;
  const failure = await env.NEWS_CACHE.get<{ status?: number }>(watchedFailureKey(symbol), "json");
  if (failure?.status === 422) throw new MarketError("현재 미국 주식의 자료를 제공합니다.", 422);
  if (failure?.status === 404) throw new MarketError("종목을 찾을 수 없습니다.", 404);
  if (failure) throw new MarketError("종목 자료를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
  return null;
});

export async function getInitialWatchedReport(symbol: string) {
  try { return await readWatchedReport(symbol); }
  catch { return null; }
}
