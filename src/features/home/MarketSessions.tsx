"use client";
import { useEffect, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { calendars, rankMarketSessions, visibleMarketSessions, sessionTransition, kstTimelineDay, timelineHours } from "@/features/market/schedule";
import { MarketSessionCard } from "./MarketSessionCard";
import styles from "./MarketSessions.module.css";

export function MarketSessions({ initialNow }: { initialNow: number }) {
  const chartId = useId();
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const resume = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
      if (document.visibilityState !== "hidden") {
        setNow(Date.now());
        timer = setInterval(() => setNow(Date.now()), 30_000);
      }
    };
    resume();
    document.addEventListener("visibilitychange", resume);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);
  const ranked = rankMarketSessions(calendars, now);
  const rows = visibleMarketSessions(ranked);
  const us = rows.find(item => item.calendar.id === "US")!;
  const next = sessionTransition(us, now);
  const nextLabel = next.clock ? next.clock + " " + us.state.nextAction : next.primary;
  const day = kstTimelineDay(now);
  const dateLabel = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", weekday: "short" }).format(now);
  const timeLabel = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  return (
    <section className={styles.sessions} aria-label="주요국 장 시간표 · KST">
      <button className={styles.toggle} type="button"
        aria-expanded={expanded} aria-controls={chartId} onClick={() => setExpanded(value => !value)}>
        <span className={styles.toggleTitle}>장 시간표</span>
        <span className={styles.summary}>
          <span className={styles.status} data-status={us.state.status}>미국 · {us.state.status === "open" ? "거래 중" : us.state.label}</span>
          <span>{nextLabel} · KST</span>
        </span>
        <span className={styles.toggleAction}>{expanded ? "접기" : "펼치기"}<ChevronDown size={16} aria-hidden="true" /></span>
      </button>
      <div id={chartId} className={styles.chart} hidden={!expanded}>
        <div className={styles.axis}>
          <time className={styles.date} dateTime={day.date}>{dateLabel} · KST</time>
          <div className={styles.scale} aria-hidden="true">
            {timelineHours.map(hour => <span key={hour} className={styles.tick} data-hour={hour}
              style={{ left: `${hour / 24 * 100}%` }}>{String(hour).padStart(2, "0")}</span>)}
            <span className={styles.nowLabel} data-align={day.progress < 10 ? "start" : day.progress > 90 ? "end" : "middle"}
              style={{ left: `${day.progress}%` }}>현재 {timeLabel}</span>
          </div>
          <span className={styles.nextHeading}>다음 일정</span>
        </div>
        <ul className={styles.list} aria-label="주요 6개국 시장">
          {rows.map(item => <MarketSessionCard key={item.calendar.id} item={item} now={now} day={day} />)}
        </ul>
      </div>
    </section>
  );
}
