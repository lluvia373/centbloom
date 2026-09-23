"use client";

import { useEffect, useState } from "react";
import { formatCompactNumber, formatPercent } from "@/lib/format";
import { changeLabels, changeObservation, type ChangeSignal, type MarketChange } from "./market-changes";
import { getCachedMarketChange } from "./use-market-changes";
import { useStockReport } from "./use-watched-reports";
import type { WatchedStockReport } from "./watched-report";
import styles from "./market-movement-evidence.module.css";

type Handoff = ReturnType<typeof getCachedMarketChange>;

/** A newer quiet report retires a previous anomaly; older quotes never replace it. */
export function selectMovementEvidence(symbol: string, cached: Handoff, report: WatchedStockReport | null | undefined) {
  const previous = cached?.item.quote.symbol === symbol ? cached.item : undefined;
  if (report === null) return null;
  if (!report || report.quote.symbol !== symbol) return previous;
  if (!previous || Date.parse(report.quote.quotedAt ?? "") >= Date.parse(previous.quote.quotedAt ?? "")) return report.change;
  return previous;
}

function direction(value: number) {
  return value > 0 ? styles.up : value < 0 ? styles.down : styles.neutral;
}

function Comparison({ signal, previousMaximum }: { signal: ChangeSignal; previousMaximum?: number }) {
  if (signal.kind === "reversal") return <div className={styles.reversal}>
    <span>{signal.baseline}거래일 연속 {signal.value > 0 ? "하락" : "상승"}</span>
    <span aria-hidden="true">→</span>
    <strong className={direction(signal.value)}>{formatPercent(signal.value)}</strong>
  </div>;
  const format = (value: number) => signal.kind === "volume" ? formatCompactNumber(value) + "주" : value.toFixed(2) + "%";
  return <dl className={styles.comparison}>
    <div><dt>{signal.kind === "volume" ? "이번 정규장" : "이번 등락폭"}</dt><dd>{format(Math.abs(signal.value))}</dd></div>
    <div><dt>{signal.kind === "volume" ? "3개월 하루 평균" : previousMaximum !== undefined ? "직전 20거래일 최대 등락폭" : "직전 20거래일 평균 등락폭"}</dt><dd>{format(previousMaximum ?? signal.baseline)}</dd></div>
  </dl>;
}

function RecentMovement({ item }: { item: MarketChange }) {
  if (item.context?.recentMoves.length !== 5) return null;
  const moves = [...item.context.recentMoves, { date: item.sessionDate, percent: item.quote.changePercent }];
  const max = Math.max(...moves.map(move => Math.abs(move.percent)), 0.01);
  return <div className={styles.history}>
    <h3>직전 5거래일 + 이번 장 <span>주가 등락률</span></h3>
    <ol aria-label={item.quote.name + " 최근 정규장 등락률"}>
      {moves.map((move, index) => <li key={move.date} className={index === moves.length - 1 ? styles.currentMove : undefined}>
        <span className={direction(move.percent)}>{move.percent > 0 ? "+" : ""}{move.percent.toFixed(1)}%</span>
        <span className={styles.moveTrack} aria-hidden="true"><i className={move.percent < 0 ? styles.moveDown : styles.moveUp} style={{ height: `${Math.abs(move.percent) / max * 50}%` }} /></span>
        <time dateTime={move.date}>{move.date.slice(5).replace("-", ".")}</time>
        {index === moves.length - 1 && <small>이번 장</small>}
      </li>)}
    </ol>
  </div>;
}

export function MovementEvidenceContent({ item }: { item: MarketChange }) {
  const previousMaximum = !item.signals.some(signal => signal.kind === "volume")
    && item.context?.previousMaxMove !== undefined && Math.abs(item.quote.changePercent) > item.context.previousMaxMove + 0.01
    ? item.context.previousMaxMove : undefined;
  return <>
    <div className={styles.observation}>
      <p>{changeObservation(item).headline}</p>
      <span>{item.sessionDate.replaceAll("-", ".")} 미국 정규장 · 지연 가능</span>
    </div>
    <div className={styles.content}>
      <div className={styles.comparisons}>
        {item.signals.map(signal => <div key={signal.kind}>
          <h3>{changeLabels[signal.kind]}{signal.kind === "volume" && <span>{signal.ratio.toFixed(1)}배</span>}</h3>
          <Comparison signal={signal} previousMaximum={signal.kind === "price" ? previousMaximum : undefined} />
        </div>)}
      </div>
      <RecentMovement item={item} />
    </div>
  </>;
}

export function MarketMovementEvidence({ symbol }: { symbol: string }) {
  const [cached, setCached] = useState(() => getCachedMarketChange(symbol));
  const report = useStockReport(symbol);
  useEffect(() => {
    if (!cached) return;
    const timer = setTimeout(() => setCached(undefined), Math.max(0, cached.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [cached]);
  const item = selectMovementEvidence(symbol, cached, report.data);
  if (report.data === null) return null;
  return <section id="market-movement" className={styles.evidence} aria-labelledby="market-movement-title">
    <h2 id="market-movement-title">변화 근거</h2>
    {item ? <MovementEvidenceContent item={item} /> : report.failed ? <p className={styles.status} role="status">변화 자료를 불러오지 못했어요. <button type="button" onClick={report.retry}>다시 시도</button></p>
      : report.data ? <p className={styles.status}>현재 확인된 특이 움직임이 없습니다.</p>
      : <p className={styles.status} role="status">변화 자료를 불러오고 있어요.</p>}
    {item && report.failed && <p className={styles.status} role="status">새 자료를 확인하지 못했어요. <button type="button" onClick={report.retry}>다시 시도</button></p>}
  </section>;
}
