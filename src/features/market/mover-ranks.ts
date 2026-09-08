import type { MoversResult } from "./movers-model";

/** Positive values mean a higher position in this list, including the losers list. */
export type RankChange = number | "new" | null;
export interface RankedMoversResult extends MoversResult {
  rankChanges: Record<string, RankChange>;
  comparedAt?: string;
}

/** Compare complete observed lists; never invent the former position of a new entry. */
export function compareMoverRanks(current: MoversResult, previous?: RankedMoversResult): RankedMoversResult {
  const fetchedAt = Date.parse(current.fetchedAt);
  if (!Number.isFinite(fetchedAt)) throw new Error("Invalid movers timestamp");
  if (previous?.kind === current.kind && Date.parse(previous.fetchedAt) >= fetchedAt) return previous;
  const baseline = previous?.kind === current.kind && previous.quotes.length ? previous : undefined;
  const positions = new Map(baseline?.quotes.map((quote, index) => [quote.symbol, index + 1]));
  return {
    ...current,
    comparedAt: baseline?.fetchedAt,
    rankChanges: Object.fromEntries(current.quotes.map((quote, index) => {
      const oldRank = positions.get(quote.symbol);
      return [quote.symbol, !baseline ? null : oldRank === undefined ? "new" : oldRank - (index + 1)];
    })),
  };
}

export function describeRankChange(change: RankChange | undefined): string {
  if (change == null) return "이전 순위 비교 자료 없음";
  if (change === "new") return "직전 조회 목록에 없던 종목";
  if (change === 0) return "직전 조회 대비 순위 변동 없음";
  return "직전 조회 대비 " + Math.abs(change) + "계단 " + (change > 0 ? "상승" : "하락");
}
