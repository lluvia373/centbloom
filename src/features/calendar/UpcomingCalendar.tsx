import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { agendaObservation } from "./agenda";
import { eventHref } from "./navigation";
import { displayValue, numericValue, releaseMetrics, type Release } from "./release";
import styles from "./upcoming-calendar.module.css";

const dateFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", weekday: "short" });
const timeFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });
const present = (value: string | null) => value !== null && value.trim() !== "";

function Comparison({ event, released }: { event: Release; released: boolean }) {
  const metrics = releaseMetrics(event).filter(metric => [metric.actual, metric.forecast, metric.previous].some(present));
  if (!metrics.length) return null;
  return <div className={styles.comparisons}>{metrics.map(metric => {
    const actual = numericValue(metric.actual, metric.unit);
    const previous = numericValue(metric.previous, metric.unit);
    const difference = actual !== null && previous !== null ? actual - previous : null;
    const showDifference = released && event.kind !== "earnings" && metric.unit === "%" && difference !== null;
    const values: [string, string | null][] = released
      ? [["발표", metric.actual], ["예상", metric.forecast], ["이전", metric.previous]]
      : [["예상", metric.forecast], ["이전", metric.previous]];
    return <div key={metric.key}>
      {event.kind === "earnings" && <p className={styles.metricLabel}>{metric.label}</p>}
      <dl className={styles.values}>{values.filter(([, value]) => present(value)).map(([label, value]) =>
        <div key={label} data-actual={label === "발표"}><dt>{label}</dt><dd>{displayValue(value, metric.unit)}</dd></div>,
      )}</dl>
      {showDifference && <p className={styles.difference}>{Math.abs(difference!) < 0.000001
        ? "이전과 같음"
        : <>이전보다 {Math.abs(difference!).toLocaleString("ko-KR", { maximumFractionDigits: 3 })}%p {difference! > 0 ? "높음" : "낮음"}</>}</p>}
    </div>;
  })}</div>;
}

function AgendaItem({ event, released = false, compact = false }: { event: Release; released?: boolean; compact?: boolean }) {
  return <li className={styles.item}>
    <Link href={eventHref(event, "/")} prefetch={false} className={styles.eventLink}>
      <div className={styles.eventMeta}>
        <time dateTime={event.at}>{dateFormat.format(new Date(event.at))}<span className={styles.time}>{event.timingEstimated ? "시간 미정" : timeFormat.format(new Date(event.at))}</span></time>
        {event.kind === "earnings" && <span className={styles.watchLabel}>관심종목</span>}
      </div>
      <div className={styles.titleRow}><h3>{event.title}</h3><ArrowUpRight size={16} aria-hidden="true" /></div>
      {!compact && <p className={styles.observation}>{released ? event.detail : agendaObservation(event)}</p>}
      <Comparison event={event} released={released} />
    </Link>
  </li>;
}

export function UpcomingCalendar({ upcoming, recent, compact = false }: { upcoming: Release[]; recent: Release[]; compact?: boolean }) {
  return <div className={styles.agenda} data-compact={compact || undefined}>
    {upcoming.length > 0 && <ul className={styles.list} aria-label="예정된 발표">
      {upcoming.map(event => <AgendaItem key={event.id} event={event} compact={compact} />)}
    </ul>}
    {recent.length > 0 && <section className={styles.recent} aria-label="최근 발표">
      <div className={styles.recentHeading}>최근 발표</div>
      <ul className={styles.list}>{recent.map(event => <AgendaItem key={event.id} event={event} released compact={compact} />)}</ul>
    </section>}
  </div>;
}
