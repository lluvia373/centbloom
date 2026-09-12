import type { ChartPoint } from "@/lib/types";
import type { MoverQuote } from "./movers-model";

export const changeKinds = ["volume", "price", "reversal"] as const;
export type ChangeKind = (typeof changeKinds)[number];
export const changeLabels: Record<ChangeKind, string> = {
  volume: "거래량 급증", price: "큰 가격 변동", reversal: "흐름 전환",
};
export interface MarketChange {
  quote: MoverQuote;
  sessionDate: string;
  signals: ChangeSignal[];
  context?: {
    recentMoves: { date: string; percent: number }[];
    previousMaxMove?: number;
  };
}
export interface ChangeSignal {
  kind: ChangeKind;
  value: number;
  baseline: number;
  ratio: number;
}
export interface MarketChangesFeed {
  items: MarketChange[];
  examined: number;
  historyUnavailable: number;
  partial: boolean;
}

export function marketSessionDate(quotedAt?: string): string | null {
  const time = Date.parse(quotedAt ?? "");
  if (!Number.isFinite(time)) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(time);
}

/** The quote's session is excluded from all historical baselines. Missing evidence produces no claim. */
export function describeMarketChange(quote: MoverQuote, history: ChartPoint[], now = Date.now()): MarketChange | null {
  const sessionDate = marketSessionDate(quote.quotedAt);
  const timestamp = Date.parse(quote.quotedAt ?? "");
  if (!sessionDate || timestamp > now + 300_000 || now - timestamp > 7 * 86400_000) return null;
  const signals: ChangeSignal[] = [];
  let context: MarketChange["context"];
  const volume = quote.volume;
  const average = quote.averageDailyVolume3Month;
  if (typeof volume === "number" && Number.isFinite(volume) && volume > 0
    && typeof average === "number" && Number.isFinite(average) && average > 0 && volume / average >= 2) {
    signals.push({ kind: "volume", value: volume, baseline: average, ratio: volume / average });
  }

  const points = [...new Map(history.filter(point => /^\d{4}-\d{2}-\d{2}$/.test(point.date)
    && point.date < sessionDate && Number.isFinite(point.close) && point.close > 0)
    .map(point => [point.date, point])).values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-21);
  const last = points.at(-1);
  const previousClose = quote.price - quote.change;
  // Refuse mismatched sessions or incompatible price bases (e.g. a corporate action).
  const compatible = last && previousClose > 0 && Math.abs(last.close / previousClose - 1) < 0.01
    && Date.parse(sessionDate) - Date.parse(last.date) <= 7 * 86400_000;
  const moves = points.slice(1).map((point, index) => (point.close / points[index].close - 1) * 100);
  const continuous = points.every((point, index) => index === 0 || Date.parse(point.date) - Date.parse(points[index - 1].date) <= 7 * 86400_000);
  const consistent = points.every((point, index) => {
    if (!index) return true;
    const previous = points[index - 1];
    if (!point.adjustedClose || !previous.adjustedClose) return true;
    return Math.abs((point.adjustedClose / point.close) / (previous.adjustedClose / previous.close) - 1) < 0.1;
  });
  if (compatible && continuous && consistent && moves.every(move => Number.isFinite(move) && Math.abs(move) < 80)) {
    if (moves.length >= 5) context = {
      recentMoves: moves.map((percent, index) => ({ date: points[index + 1].date, percent })).slice(-5),
      previousMaxMove: moves.length === 20 ? Math.max(...moves.map(Math.abs)) : undefined,
    };
    const typical = moves.reduce((sum, move) => sum + Math.abs(move), 0) / moves.length;
    if (moves.length === 20 && typical >= 0.1 && Math.abs(quote.changePercent) >= 3 && Math.abs(quote.changePercent) / typical >= 2) {
      signals.push({ kind: "price", value: quote.changePercent, baseline: typical, ratio: Math.abs(quote.changePercent) / typical });
    }
    let streak = 0;
    if (Math.abs(quote.changePercent) >= 0.5) {
      for (const move of [...moves].reverse()) {
        if (move * quote.changePercent >= 0) break;
        streak++;
      }
    }
    // An older nonmatching day must establish the beginning; do not call a truncated streak exact.
    if (streak >= 3 && streak < moves.length) signals.push({ kind: "reversal", value: quote.changePercent, baseline: streak, ratio: streak });
  }
  return signals.length ? { quote, sessionDate, signals, ...(context ? { context } : {}) } : null;
}

/** Describe observed combinations, not motives, money flows, or invented analyst activity. */
export function changeObservation(item: MarketChange): { headline: string; evidence: string } {
  const volume = item.signals.find(signal => signal.kind === "volume");
  const price = item.signals.find(signal => signal.kind === "price");
  const reversal = item.signals.find(signal => signal.kind === "reversal");
  const primary = item.signals[0];
  const change = item.quote.changePercent;
  const direction = change > 0 ? "상승" : change < 0 ? "하락" : "보합";
  const signed = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
  if (primary.kind === "reversal" && reversal) return {
    headline: changeHeadline(reversal),
    evidence: volume ? `방향 전환과 함께 거래량도 평소의 ${volume.ratio.toFixed(1)}배` : `이번 장 ${signed(change)} · 직전 연속 흐름과 반대 방향`,
  };
  if (volume && price) return {
    headline: `큰 ${direction}과 거래량 급증이 겹쳤어요`,
    evidence: `거래량 ${volume.ratio.toFixed(1)}배 · 가격 등락폭 ${price.ratio.toFixed(1)}배`,
  };
  if (volume && Math.abs(change) < 1) return {
    headline: `거래는 급증, 주가는 ${change === 0 ? "보합" : `소폭 ${direction}`}`,
    evidence: `거래량 ${volume.ratio.toFixed(1)}배에도 주가 변화는 ${signed(change)}`,
  };
  const maximum = item.context?.previousMaxMove;
  if (price && maximum !== undefined && Math.abs(change) > maximum + 0.01) return {
    headline: "최근 20거래일의 최대 등락폭을 넘었어요",
    evidence: `직전 20거래일 최대 ${maximum.toFixed(2)}% → 이번 ${signed(change)}`,
  };
  return {
    headline: changeHeadline(primary),
    evidence: volume ? `거래 증가와 함께 주가는 ${signed(change)}` : `평소 하루 등락폭 ${primary.baseline.toFixed(2)}% → 이번 ${signed(change)}`,
  };
}

export function changeHeadline(signal: ChangeSignal): string {
  if (signal.kind === "volume") return `거래량이 평소의 ${signal.ratio.toFixed(1)}배`;
  if (signal.kind === "price") return `가격 변동이 평소의 ${signal.ratio.toFixed(1)}배`;
  return `${signal.baseline}거래일 ${signal.value > 0 ? "하락 후 반등" : "상승 후 하락"}`;
}

/** One slot per type first, then fill by magnitude. A stock appears only once. */
export function selectMarketChanges(items: MarketChange[], kind?: ChangeKind, limit = 3) {
  const strength = (item: MarketChange) => Math.max(...item.signals.filter(signal => !kind || signal.kind === kind).map(signal => signal.ratio));
  const ranked = items.filter(item => item.signals.some(signal => !kind || signal.kind === kind))
    .map(item => ({ ...item, signals: [...item.signals].sort((a, b) => Number(b.kind === kind) - Number(a.kind === kind)) }))
    .sort((a, b) => strength(b) - strength(a) || a.quote.symbol.localeCompare(b.quote.symbol));
  const chosen: MarketChange[] = [];
  for (const type of kind ? [kind] : changeKinds) {
    const item = ranked.find(item => !chosen.some(chosen => chosen.quote.symbol === item.quote.symbol) && item.signals.some(signal => signal.kind === type));
    if (item) chosen.push({ ...item, signals: [...item.signals].sort((a, b) => Number(b.kind === type) - Number(a.kind === type)) });
    if (chosen.length === limit) return chosen;
  }
  for (const item of ranked) {
    if (!chosen.some(chosen => chosen.quote.symbol === item.quote.symbol)) chosen.push(item);
    if (chosen.length === limit) break;
  }
  return chosen;
}
