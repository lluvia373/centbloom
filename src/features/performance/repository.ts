import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { PortfolioPerformancePoint } from "@/lib/types";
export interface SavedHistory {
  revision: string;
  startedAt: string;
  points: PortfolioPerformancePoint[];
  serverSynced?: boolean;
}
const key = (userId: string | null) =>
  `centifolio-performance-v2:${userId ?? "guest"}`;
function validHistory(value: unknown): value is SavedHistory {
  if (!value || typeof value !== "object") return false;
  const raw = value as SavedHistory;
  return (
    typeof raw.revision === "string" &&
    Number.isFinite(Date.parse(raw.startedAt)) &&
    Array.isArray(raw.points) &&
    raw.points.every(
      (point, index) =>
        /^\d{4}-\d{2}-\d{2}$/.test(point.date) &&
        Number.isFinite(point.assetValueKRW) &&
        point.assetValueKRW >= 0 &&
        Number.isFinite(point.twrIndex) &&
        Number.isFinite(point.netFlowKRW) &&
        Number.isFinite(point.cumulativeNetFlowKRW) &&
        Number.isFinite(point.cumulativeProfitKRW) &&
        (index === 0 || raw.points[index - 1].date < point.date),
    )
  );
}
export async function readHistory(
  userId: string | null,
  revision: string,
  signal: AbortSignal,
): Promise<{ saved: SavedHistory | null; startedAt: string | null }> {
  signal = AbortSignal.any([signal, AbortSignal.timeout(20_000)]);
  let saved: SavedHistory | null = null;
  try {
    const raw = JSON.parse(localStorage.getItem(key(userId)) ?? "null");
    if (validHistory(raw)) saved = raw;
  } catch {
    /* Derived cache only; original records remain untouched. */
  }
  const client = getSupabaseBrowserClient();
  if (!client || !userId) return { saved, startedAt: saved?.startedAt ?? null };
  const preference = client
    .from("portfolio_preferences")
    .select("portfolio_started_at")
    .eq("user_id", userId)
    .abortSignal(signal)
    .maybeSingle();
  const snapshots = (async () => {
    const points: PortfolioPerformancePoint[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await client
        .from("portfolio_snapshots")
        .select("*")
        .eq("user_id", userId)
        .eq("ledger_revision", revision)
        .order("snapshot_date")
        .range(offset, offset + 999)
        .abortSignal(signal);
      if (error) {
        if (error.code === "42703") return null;
        throw new Error("저장된 성과를 불러오지 못했습니다.");
      }
      points.push(
        ...data.map((row) => ({
          date: row.snapshot_date,
          cutoffAt: row.cutoff_at,
          assetValueKRW: Number(row.total_assets_krw),
          twrIndex: Number(row.twr_index),
          netFlowKRW: Number(row.net_flow_krw),
          cumulativeNetFlowKRW: Number(row.cumulative_net_flow_krw),
          cumulativeProfitKRW: Number(row.cumulative_profit_krw),
          active: row.is_active,
          final: row.is_final,
        })),
      );
      if (data.length < 1000) return points;
    }
  })();
  const [result, points] = await Promise.all([preference, snapshots]);
  if (result.error) throw new Error("성과 기준일을 불러오지 못했습니다.");
  const startedAt = result.data?.portfolio_started_at ?? null;
  if (
    startedAt &&
    points?.length &&
    (saved?.revision !== revision || points.length > saved.points.length)
  ) {
    const candidate = { revision, startedAt, points, serverSynced: true };
    if (!validHistory(candidate))
      throw new Error("저장된 성과 기록이 올바르지 않습니다.");
    saved = candidate;
  }
  return { saved, startedAt };
}
export async function saveHistory(
  userId: string | null,
  history: SavedHistory,
  changed: PortfolioPerformancePoint[],
  signal: AbortSignal,
) {
  signal = AbortSignal.any([signal, AbortSignal.timeout(20_000)]);
  signal.throwIfAborted();
  const client = getSupabaseBrowserClient();
  let warning: string | null = null;
  if (client && userId && changed.length) {
    const { error } = await client
      .rpc("save_portfolio_performance", {
        expected_revision: history.revision,
        started_at: history.startedAt,
        points: changed,
      })
      .abortSignal(signal);
    if (error)
      warning =
        error.code === "PGRST202"
          ? "성과는 계산됐지만 서버 저장 업데이트가 필요합니다."
          : "성과는 계산됐지만 서버 저장에 실패했습니다. 다음 갱신 때 재시도합니다.";
  }
  signal.throwIfAborted();
  try {
    localStorage.setItem(
      key(userId),
      JSON.stringify({ ...history, serverSynced: !warning }),
    );
  } catch {
    warning = "성과의 브라우저 사본을 저장하지 못했습니다.";
  }
  return warning;
}
