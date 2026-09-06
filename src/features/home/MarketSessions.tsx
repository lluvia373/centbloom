"use client";
import { useEffect, useState } from "react";
import { calendars, formatKst, getMarketSession } from "@/features/market/schedule";
import styles from "./MarketSessions.module.css";

export function MarketSessions({ initialNow }: { initialNow: number }) {
  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const tick = () => setNow(Date.now());
    const resume = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
      if (document.visibilityState !== "hidden") {
        tick();
        timer = setInterval(tick, 30_000);
      }
    };
    resume();
    document.addEventListener("visibilitychange", resume);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);
  return (
    <section className={styles.sessions} aria-label="국가별 정규장 일정, 시각은 한국시간">
      {calendars.map(calendar => {
        const state = getMarketSession(calendar, now);
        return (
          <details key={calendar.id} className={styles.market}
            onKeyDown={event => { if (event.key === "Escape") event.currentTarget.open = false; }}>
            <summary className={styles.summary} aria-label={`${calendar.name} ${state.label}, 상세 일정과 출처`}>
              <span className={styles.country}>{calendar.name}<span className={styles.zone}>KST</span></span>
              <span className={styles.status} data-status={state.status}><i />{state.label}</span>
              <span className={styles.next}>
                {state.skippedHoliday && <span className={styles.holiday}>{state.skippedHoliday} 후 · </span>}
                {state.nextAt ? `${formatKst(state.nextAt)} ${state.nextAction}` : "다음 일정 확인 중"}
              </span>
            </summary>
            <div className={styles.detail}>
              <strong>{calendar.exchange}</strong>
              <p>{state.reason}. 날짜 판정은 거래소 현지 시간, 표시 시각은 한국시간(KST)입니다.</p>
              <p>공표된 정규장 일정 기준입니다. 시간외·대체거래소·개별 종목 거래정지·긴급 휴장 실시간 감시는 포함하지 않습니다.</p>
              <p>2026년 일정 확인: 9월 6일. 이후 연도와 미확정 특별 거래시간은 추정하지 않습니다.</p>
              {calendar.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label} ↗</a>)}
            </div>
          </details>
        );
      })}
    </section>
  );
}
