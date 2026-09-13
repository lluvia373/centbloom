import { agendaObservation } from "./agenda";
import { displayValue, releaseMetrics, releaseStatus, hasActual, type Release } from "./release";
import { ReleaseHistory } from "./ReleaseHistory";
import styles from "./calendar.module.css";

export function ReleaseDetails({ event, now, from }: { event: Release; now: number; from: string }) {
  const metrics = releaseMetrics(event);
  const hasValues = metrics.some(metric => [metric.actual, metric.forecast, metric.previous].some(value => value !== null && value.trim() !== ""));
  const hasForecast = metrics.some(metric => metric.forecast !== null && metric.forecast.trim() !== "");
  const columns = [
    { label: "실제치", key: "actual" }, { label: "예상치", key: "forecast" }, { label: "이전치", key: "previous" },
  ] as const;
  return <>
    <div className={styles.heading}><h1>{event.title}</h1><span>{event.kind === "earnings" ? "실적 발표" : "경제지표"}</span></div>
    <p className={styles.meta}>{event.detail} · {new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", ...(event.timingEstimated ? {} : { timeStyle: "short" as const }) }).format(new Date(event.at))} KST{event.timingEstimated ? " · 시간 미정" : ""}</p>
    <p className={styles.status} data-released={hasActual(event)}>{releaseStatus(event, now)}</p>
    <section className={styles.observationSection}>
      <h2>살펴볼 내용</h2>
      <p>{agendaObservation(event)}</p>
    </section>
    {hasValues && metrics.map(metric => {
      const available = columns.filter(column => metric[column.key] !== null && metric[column.key]!.trim() !== "");
      if (!available.length) return null;
      return <section key={metric.key} aria-label={metric.label}>
        {event.kind === "earnings" && <h2 className={styles.metricTitle}>{metric.label}</h2>}
        <dl className={styles.values}>{available.map(column => <div key={column.key}>
          <dt>{column.label}</dt><dd>{displayValue(metric[column.key], metric.unit)}</dd>
        </div>)}</dl>
      </section>;
    })}
    {event.kind !== "earnings" && event.previousOriginal !== null && <p className={styles.meta}>이전치 수정 전 {displayValue(event.previousOriginal, event.unit)}</p>}
    {hasForecast && <p className={styles.meta}>예상치는 시장 예상의 종합값입니다.</p>}
    {hasValues && <ReleaseHistory event={event} from={from} />}
    {event.source.url && <a className={styles.sourceLink} href={event.source.url} target="_blank" rel="noopener noreferrer">{event.source.label} · 공식 발표 보기 ↗</a>}
  </>;
}
