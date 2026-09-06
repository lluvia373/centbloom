"use client";
import Link from "next/link";
import { marketEvents } from "./data";
import { useCalendarFeed } from "./use-calendar-feed";
import { scheduleRelease } from "./release";
import { safeReturn } from "./navigation";
import { ReleaseDetails } from "./ReleaseDetails";
import styles from "./calendar.module.css";
export function ReleasePage({id,now,from}: {id:string;now:number;from?:string}) {
  const feed=useCalendarFeed("event="+encodeURIComponent(id));
  const fallback=marketEvents.find(event=>event.id===id);
  const event=feed.data?.events.find(event=>event.id===id) ?? (!feed.data && fallback ? scheduleRelease(fallback) : undefined);
  const returnTo=safeReturn(from);
  return <article className={styles.page}>
    <Link className={styles.backLink} href={returnTo}>← 일정 목록</Link>
    {feed.failed && <p role="status">일정 갱신 실패 <button onClick={feed.retry}>다시 시도</button></p>}
    {event ? <ReleaseDetails event={event} now={feed.data?.asOf ?? now} from={returnTo}/>
      : !feed.data ? <p role="status">{feed.failed ? "일정을 불러오지 못했어요." : "일정 확인 중…"}</p>
      : <><h1>일정을 찾을 수 없어요.</h1><p className={styles.empty}>저장된 일정을 캘린더에서 확인해주세요.</p></>}
  </article>;
}
