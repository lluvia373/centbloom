"use client";
import Link from "next/link";
import { marketEvents } from "./data";
import { kstDate } from "./model";
import { scheduleRelease } from "./release";
import { calendarHref, onDay, shiftDay, validDay, weekDays } from "./navigation";
import { useCalendarSelection } from "./use-calendar-selection";
import { useCalendarFeed } from "./use-calendar-feed";
import { EventList } from "./EventList";
import styles from "./calendar.module.css";
export function WeekCalendar({now}: {now:number}) {
  const {params,update} = useCalendarSelection();
  const requested = params.get("calendarDay");
  const selected = validDay(requested) ? requested : kstDate(now);
  const days = weekDays(selected);
  const feed = useCalendarFeed("week=" + days[0]);
  const clock = feed.data?.asOf ?? now;
  const records = feed.data?.events ?? marketEvents.map(scheduleRelease);
  const from = "/?" + new URLSearchParams({...Object.fromEntries(params),calendarDay:selected});
  return <>
    <div className={styles.heading}><h2>이번 주 일정</h2><span>KST</span></div>
    <div className={styles.weekToolbar}>
      <button aria-label="이전 주" onClick={() => update({calendarDay:shiftDay(selected,-7)})}>‹</button>
      <span>{days[0].slice(5).replace("-",".")} – {days[6].slice(5).replace("-",".")}</span>
      <button aria-label="다음 주" onClick={() => update({calendarDay:shiftDay(selected,7)})}>›</button>
      <button onClick={() => update({calendarDay:kstDate(clock)})}>오늘</button>
    </div>
    <div className={styles.weekStrip} aria-label="주간 날짜 선택">
      {days.map((day,index) => <button key={day} aria-label={day + " 일정 " + onDay(records,day).length + "건"} aria-pressed={day===selected} data-today={day===kstDate(clock)} onClick={() => update({calendarDay:day})}>
        <span>{["월","화","수","목","금","토","일"][index]}</span><strong>{Number(day.slice(-2))}</strong><small>{onDay(records,day).length}건</small>
      </button>)}
    </div>
    <p className={styles.coverage}>{!feed.data?.connected ? "발표 결과·실적 데이터 미연결" : !feed.data.earningsConnected ? "실적 데이터 미연결" : null}</p>
    {feed.failed && <p role="status">일정 갱신 실패 <button onClick={feed.retry}>다시 시도</button></p>}
    <div aria-live="polite"><EventList events={onDay(records,selected)} now={clock} from={from}/></div>
    <Link href={calendarHref(selected)} className={styles.footer}>전체 일정 →</Link>
  </>;
}
