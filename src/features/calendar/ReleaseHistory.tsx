"use client";
import Link from "next/link";
import { useCalendarFeed } from "./use-calendar-feed";
import { displayValue, releaseMetrics, type Release } from "./release";
import { eventHref } from "./navigation";
import { ReleaseTrend } from "./ReleaseTrend";
import { kstDate } from "./model";
import styles from "./calendar.module.css";
export function ReleaseHistory({event,from}: {event:Release;from:string}) {
  const history = useCalendarFeed("series="+encodeURIComponent(event.seriesKey));
  // Include unreleased rows as gaps; never join a line across a missing release.
  const records = (history.data?.events ?? []).filter(item=>item.seriesKey===event.seriesKey)
    .sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
  if (history.failed && !history.data) return <p role="status">이력을 불러오지 못했어요. <button onClick={history.retry}>다시 시도</button></p>;
  if (!history.data) return <p role="status">이력 확인 중…</p>;
  return <section className={styles.releaseHistory}>
    <h2>발표 이력</h2>
    {history.failed && <p role="status">이력 갱신 실패 · 이전 조회 결과 <button onClick={history.retry}>다시 시도</button></p>}
    {!records.length ? <p className={styles.empty}>{history.data.connected ? "아직 저장된 발표 이력이 없어요." : "결과 데이터 연결 전이에요. 실제치·예상치·과거 이력은 아직 제공되지 않아요."}</p>
    : releaseMetrics(event).map(metric=><section key={metric.key}>
      {event.kind==="earnings" && <h3>{metric.label}</h3>}
      <ReleaseTrend records={records} event={event} metricKey={metric.key} unit={metric.unit}/>
      <div className={styles.historyScroll}><table className={styles.history}>
        <caption className={styles.tableCaption}>{metric.label} 이력 · KST</caption>
        <thead><tr><th>발표일</th><th>기준 기간</th><th>실제치</th><th>예상치</th><th>이전치</th></tr></thead>
        <tbody>{records.map(item=>{
          const values=releaseMetrics(item).find(value=>value.key===metric.key);
          return <tr key={item.id}><td><Link prefetch={false} href={eventHref(item,from)}>{kstDate(item.at)}</Link></td><td>{item.detail}</td>
          <td>{displayValue(values?.actual ?? null,values?.unit)}</td><td>{displayValue(values?.forecast ?? null,values?.unit)}</td><td>{displayValue(values?.previous ?? null,values?.unit)}</td></tr>;
        })}</tbody>
      </table></div>
    </section>)}
  </section>;
}
