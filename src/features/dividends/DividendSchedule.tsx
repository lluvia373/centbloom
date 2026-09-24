"use client";
import { useMemo, useState } from "react";
import type { Transaction } from "@/lib/types";
import { todayISO } from "@/lib/format";
import { dividendSchedule } from "./model";
import type { DividendFeed } from "./types";
import styles from "./DividendSchedule.module.css";

const money = (value: number, currency: string) => new Intl.NumberFormat("ko-KR", {
  style: "currency", currency, currencyDisplay: "code", maximumFractionDigits: currency === "KRW" ? 0 : 2,
}).format(value);
const date = (value: string) => `${Number(value.slice(5, 7))}월 ${Number(value.slice(8, 10))}일`;
const reasons = {
  "share-basis": "주식 분할 전 거래 · 수량 확인 필요",
  history: "거래 수량 확인 필요",
  announcement: "발표 자료 확인 필요",
  entitlement: "배당 권리 확인 필요",
};

/** Prepared public facts; no sample transactions, cash write, or request-time collection. */
export function DividendSchedule({ transactions, portfolioId, feed, asOfDate = todayISO() }: {
  transactions: readonly Transaction[]; portfolioId: string; feed: DividendFeed; asOfDate?: string;
}) {
  const [limit, setLimit] = useState(3);
  const schedule = useMemo(() => dividendSchedule(transactions, feed, asOfDate, portfolioId), [transactions, feed, asOfDate, portfolioId]);
  if (!schedule.hasTransactions) return null;
  const stale = schedule.checkedAt !== null && Date.parse(asOfDate) - Date.parse(schedule.checkedAt.slice(0, 10)) > 86_400_000;
  return <section className={styles.section} aria-label="예상 배당">
    <div className={styles.heading}>
      <h2>예상 배당</h2>
      <span>{schedule.from ? `${schedule.from.slice(0, 4)}년 자료` : "발표된 배당 기준"}{stale && schedule.checkedAt ? ` · ${date(schedule.checkedAt.slice(0, 10))} 확인` : ""}</span>
    </div>
    {schedule.missingSymbols.length > 0 && <p className={styles.note}>자료 미확인: {schedule.missingSymbols.join(", ")}. 이 종목은 예상액에 포함되지 않았습니다.</p>}
    {schedule.partialSymbols.length > 0 && <p className={styles.note}>일부 배당 미확인: {schedule.partialSymbols.join(", ")}. 확인된 발표만 표시합니다.</p>}
    {!schedule.rows.length ? <p className={styles.note}>{schedule.missingSymbols.length ? "확인된 자료에서 계산할 배당이 없습니다." : "확인된 발표 중 이 포트폴리오에서 계산할 배당이 없습니다."}</p> : <>
      <ul className={styles.list}>
        {schedule.rows.slice(0, limit).map(({ event, estimate, rate }) => <li key={event.id} className={styles.row}>
          <div className={styles.identity}>
            <a href={event.sourceUrl} target="_blank" rel="noreferrer" aria-label={`${event.name} (${event.symbol}) ${event.recordDate} 기준 배당 공시 원문, 새 탭`}>{event.name}</a>
            <span>{event.symbol} · {event.paymentDate ? `${event.paymentDate.slice(0, 4)}년 ${date(event.paymentDate)} 지급 예정일` : "지급일 미확인"}</span>
          </div>
          {estimate.status === "estimated" ? <>
            <div className={styles.amount}><span>세전</span><strong>{money(estimate.grossAmount, event.currency)}</strong></div>
            <div className={styles.amount}><span>예상 세후{rate !== null ? ` · ${Number((rate * 100).toFixed(2))}%` : ""}</span><strong>{estimate.estimatedNetAmount !== null ? money(estimate.estimatedNetAmount, event.currency) : "세율 확인 필요"}</strong></div>
          </> : <p className={styles.reason}>{estimate.status === "unavailable" ? reasons[estimate.reason] : "배당 취소"}</p>}
        </li>)}
      </ul>
      <p className={styles.note}>한국 거주자·일반 계좌의 예상액이며, 실제 입금액이 아닙니다.{schedule.rows.some(row => row.estimate.status === "estimated" && row.estimate.quantityBasis === "kst-day-end-estimate") && " 해외 거래는 한국 날짜의 하루 마감 수량으로 추정합니다."}</p>
      {schedule.rows.length > limit && <button type="button" className={styles.more} onClick={() => setLimit(value => value + 10)}>배당 {Math.min(10, schedule.rows.length - limit)}건 더 보기</button>}
    </>}
    {schedule.noAnnouncements.length > 0 && <p className={styles.note}>확인 기간에 배당 발표 없음: {schedule.noAnnouncements.join(", ")}.</p>}
  </section>;
}
