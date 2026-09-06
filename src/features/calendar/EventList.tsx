import Link from "next/link";
import { eventHref } from "./navigation";
import { releaseStatus, hasActual, type Release } from "./release";
import styles from "./calendar.module.css";
export function EventList({events,now,from}: {events:Release[];now:number;from:string}) {
  if (!events.length) return <p className={styles.empty}>등록된 일정이 없어요.</p>;
  return <ul className={styles.eventList}>{events.map(event => <li key={event.id}>
    <Link href={eventHref(event,from)} prefetch={false}>
      <time dateTime={event.at}>{new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(event.at))}</time>
      <span><strong>{event.title}</strong><small>{event.kind === "earnings" ? "실적 발표" : "경제지표"}</small></span>
      <small data-released={hasActual(event)}>{releaseStatus(event,now)}</small>
    </Link>
  </li>)}</ul>;
}
