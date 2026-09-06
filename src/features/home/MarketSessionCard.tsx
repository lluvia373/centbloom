import { marketTimeline, sessionTransition, timelineHours, type RankedMarketSession, type TimelineDay } from "@/features/market/schedule";
import styles from "./MarketSessions.module.css";

export function MarketSessionCard({ item, now, day }: { item: RankedMarketSession; now: number; day: TimelineDay }) {
  const { calendar, state } = item;
  const next = sessionTransition(item, now);
  const timeline = marketTimeline(calendar, day);
  return (
    <li className={styles.market} data-market={calendar.id}>
      <div className={styles.identity}>
        <strong className={styles.marketName}>{calendar.name}</strong>
        <span className={styles.status} data-status={state.status}>
          <i aria-hidden="true" />{state.status === "open" ? "거래 중" : state.label}
        </span>
      </div>
      <div className={styles.track} role="img"
        aria-label={`${calendar.name} ${day.date} KST: ${timeline.segments.length ? timeline.description : timeline.emptyLabel}`}
        title={timeline.segments.length ? timeline.description + " · KST" : timeline.emptyLabel}>
        {timelineHours.map(hour => <i key={hour} className={styles.gridline} style={{ left: `${hour / 24 * 100}%` }} aria-hidden="true" />)}
        {timeline.segments.map(segment => <span key={segment.startAt} className={styles.bar}
          data-auction={segment.auction} data-active={now >= segment.startAt && now < segment.endAt}
          style={{ left: `${segment.left}%`, width: `${segment.width}%` }} aria-hidden="true" />)}
        {timeline.segments.length === 0 && <span className={styles.noSession} aria-hidden="true">{timeline.emptyLabel}</span>}
        {timeline.segments.length > 0 && timeline.uncertain && <span className={styles.uncertain}>일부 시간 미확인</span>}
      </div>
      <div className={styles.next} data-imminent={next.imminent}>
        <strong>{next.primary}</strong>
        {next.clock && <time dateTime={new Date(state.nextAt!).toISOString()}>{next.clock}</time>}
      </div>
    </li>
  );
}
