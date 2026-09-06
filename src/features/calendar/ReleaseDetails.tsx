import { displayValue, releaseMetrics, releaseStatus, hasActual, type Release } from "./release";
import { ReleaseHistory } from "./ReleaseHistory";
import styles from "./calendar.module.css";
export function ReleaseDetails({event,now,from}: {event:Release;now:number;from:string}) {
  return <>
    <div className={styles.heading}><h1>{event.title}</h1><span>{event.kind==="earnings" ? "실적 발표" : "경제지표"}</span></div>
    <p className={styles.meta}>{event.detail} · {new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",dateStyle:"medium",timeStyle:"short"}).format(new Date(event.at))} KST{event.timingEstimated ? " · 시각 미확정" : ""}</p>
    <p className={styles.status} data-released={hasActual(event)}>{releaseStatus(event,now)}</p>
    {releaseMetrics(event).map(metric=><section key={metric.key} aria-label={metric.label}>
      {event.kind==="earnings" && <h2 className={styles.metricTitle}>{metric.label}</h2>}
      <dl className={styles.values}>{[["실제치",metric.actual],["예상치",metric.forecast],["이전치",metric.previous]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{displayValue(value,metric.unit)}</dd></div>)}</dl>
    </section>)}
    {event.kind!=="earnings" && event.previousOriginal!==null && <p className={styles.meta}>이전치 수정 전 {displayValue(event.previousOriginal,event.unit)}</p>}
    <p className={styles.meta}>예상치는 시장 컨센서스 기준 · —는 미수신</p>
    <ReleaseHistory event={event} from={from}/>
    {event.source.url && <a className={styles.sourceLink} href={event.source.url} target="_blank" rel="noopener noreferrer">{event.source.label}</a>}
  </>;
}
