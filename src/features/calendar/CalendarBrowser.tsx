"use client";
import Link from "next/link";
import { useRef } from "react";
import { marketEvents } from "./data";
import { eventsInMonth, groupEvents, kstDate, shiftMonth, validMonth } from "./model";
import { monthCells } from "./month-grid";
import { scheduleRelease, hasActual } from "./release";
import { calendarHref, eventFilter, eventHref, filterEvents, validDay } from "./navigation";
import { useCalendarFeed } from "./use-calendar-feed";
import { useCalendarSelection } from "./use-calendar-selection";
import { EventList } from "./EventList";
import styles from "./calendar.module.css";
export function CalendarBrowser({now}: {now:number}) {
  const {params,update} = useCalendarSelection();
  const selectedMonth = params.get("month");
  const month = validMonth(selectedMonth ?? undefined) ? selectedMonth! : kstDate(now).slice(0,7);
  const requestedDay = params.get("day");
  const day = validDay(requestedDay) && requestedDay.startsWith(month) ? requestedDay : kstDate(now).startsWith(month) ? kstDate(now) : month+"-01";
  const kind = eventFilter(params.get("type"));
  const dayPanel = useRef<HTMLElement>(null);
  const feed = useCalendarFeed("month="+month);
  const clock = feed.data?.asOf ?? now;
  const events = filterEvents(feed.data?.events ?? eventsInMonth(marketEvents,month).map(scheduleRelease),kind);
  const grouped = new Map(groupEvents(events).map(group=>[group.day,group.events]));
  const dayEvents = (date:string) => grouped.get(date) ?? [];
  const from = calendarHref(day,kind);
  function chooseDay(date:string) {
    update({month,day:date,type:kind});
    if (window.matchMedia("(max-width:760px)").matches)
      requestAnimationFrame(() => dayPanel.current?.scrollIntoView({block:"start",behavior:"instant"}));
  }
  function changeMonth(next:string) { update({month:next,day:next+"-01",type:kind}); }
  return <>
    <div className={styles.toolbar}>
      <button aria-label="이전 달" onClick={() => changeMonth(shiftMonth(month,-1))}>‹</button>
      <span className={styles.month} aria-live="polite">{month.replace("-","년 ")}월</span>
      <button aria-label="다음 달" onClick={() => changeMonth(shiftMonth(month,1))}>›</button>
      <button onClick={() => update({month:kstDate(clock).slice(0,7),day:kstDate(clock),type:kind})}>오늘</button>
      <div className={styles.filters} role="group" aria-label="일정 종류">
        {(["all","earnings","economic"] as const).map((value,index) => <button key={value} aria-pressed={kind===value} onClick={() => update({month,day,type:value})}>{["전체","실적","경제지표"][index]}</button>)}
      </div>
    </div>
    <p className={styles.coverage}>{!feed.data?.connected ? "발표 결과·실적 데이터 미연결 · 등록된 일정만 표시" : !feed.data.earningsConnected ? "실적 데이터 미연결" : "KST 기준"}</p>
    {feed.failed && <p role="status">갱신 실패 · 기존 일정 표시 중 <button onClick={feed.retry}>다시 시도</button></p>}
    <div className={styles.monthGrid}>
      {["일","월","화","수","목","금","토"].map(weekday => <div className={styles.weekday} key={weekday}>{weekday}</div>)}
      {monthCells(month).map((date,index) => date ? <div className={styles.cell} key={date} data-today={date===kstDate(clock)} data-selected={date===day}>
        <button className={styles.dateButton} aria-label={date+" 일정 "+dayEvents(date).length+"건"} aria-pressed={date===day} onClick={() => chooseDay(date)}>{Number(date.slice(-2))}</button>
        <div className={styles.cellEvents}>{dayEvents(date).slice(0,3).map(event => <Link prefetch={false} key={event.id} className={styles.gridEvent} href={eventHref(event,calendarHref(date,kind))} onClick={() => update({month,day:date,type:kind})}>
          <time>{new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(event.at))}</time>
          <span>{event.title}</span>{hasActual(event) && <small>발표 완료</small>}
        </Link>)}</div>
        {!!dayEvents(date).length && <button className={styles.dayCount} aria-label={date+" 전체 일정 보기"} onClick={() => chooseDay(date)}>{dayEvents(date).length}건</button>}
      </div> : <div className={styles.blankCell} key={"blank"+index}/>)}
    </div>
    <section ref={dayPanel} className={styles.selectedDay} aria-label="선택한 날짜의 일정">
      <h2>{day.replaceAll("-",". ")}<span>KST</span></h2>
      <EventList events={dayEvents(day)} now={clock} from={from}/>
    </section>
  </>;
}
