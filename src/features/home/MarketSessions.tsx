"use client";
import { useEffect, useState } from "react";
import { calendars, rankMarketSessions, groupSessionAlerts, visibleMarketSessions, sessionTransition, formatKst, kstTimelineDay, timelineHours } from "@/features/market/schedule";
import { MarketSessionCard } from "./MarketSessionCard";
import styles from "./MarketSessions.module.css";

export function MarketSessions({ initialNow }: { initialNow: number }) {
  const [region, setRegion] = useState("전체");
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
  const alerts = groupSessionAlerts(ranked);
  const { rows, total } = visibleMarketSessions(ranked, region, expanded);
  const day = kstTimelineDay(now);
  const dateLabel = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", weekday: "short" }).format(now);
  const timeLabel = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  return (
    <section className={styles.sessions} aria-label="세계 정규장 일정 · KST">
      <div className={styles.toolbar}>
        <div className={styles.filters} role="group" aria-label="시장 지역">
          {["전체", "미주", "아시아", "유럽", "오세아니아"].map(value => (
            <button key={value} type="button" aria-pressed={region === value}
              onClick={() => { setRegion(value); setExpanded(false); }}>{value}</button>
          ))}
        </div>
        <span className={styles.zone}>정규장 · KST</span>
      </div>
      {alerts.length > 0 && <ul className={styles.alerts} aria-label="특별 휴장·거래 일정">
        {alerts.map(group => {
          const first = group[0];
          const date = first.alert?.date;
          return <li key={group.map(item => item.calendar.id).join("-")} className={styles.alert}
            data-alert-markets={group.map(item => item.calendar.id).join(",")}>
            <strong className={styles.countries}>{group.map(item => <span key={item.calendar.id}>{item.calendar.name}</span>)}</strong>
            <span className={styles.headline}>{date && <time dateTime={date}>{Number(date.slice(5, 7))}.{Number(date.slice(8))} </time>}{first.alert?.label}</span>
            <span className={styles.alertNext}>{first.state.nextAt
              ? first.state.status === "auction" ? sessionTransition(first, now).primary :
                `${formatKst(first.state.nextAt)} ${first.state.nextAction}`
              : "거래시간 확인 중"}</span>
          </li>;
        })}
      </ul>}
      <div className={styles.chart}>
        <div className={styles.axis}>
          <time className={styles.date} dateTime={day.date}>{dateLabel}</time>
          <div className={styles.scale} aria-hidden="true">
            {timelineHours.map(hour => <span key={hour} className={styles.tick} data-hour={hour}
              style={{ left: `${hour / 24 * 100}%` }}>{String(hour).padStart(2, "0")}</span>)}
            <span className={styles.nowLabel} data-align={day.progress < 10 ? "start" : day.progress > 90 ? "end" : "middle"}
              style={{ left: `${day.progress}%` }}>현재 {timeLabel}</span>
          </div>
          <span className={styles.nextHeading}>다음 일정</span>
        </div>
        <ul id="market-session-list" className={styles.list} aria-label={region + " 시장"}>
          {rows.map(item => <MarketSessionCard key={item.calendar.id} item={item} now={now} day={day} />)}
        </ul>
      </div>
      {total > 6 && <button className={styles.more} type="button"
        aria-expanded={expanded} aria-controls="market-session-list" onClick={() => setExpanded(!expanded)}>
        {expanded ? "접기" : `전체 시장 · ${total}`}
      </button>}
    </section>
  );
}
