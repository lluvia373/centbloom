import { CALENDAR_REVIEWED_AT, upcomingEvents } from "./calendar";
import styles from "./home.module.css";
export function MarketCalendar({ now }: { now: number }) {
  const events = upcomingEvents(now);
  return (
    <section className={styles.panel} aria-label="다가오는 경제 일정">
      <div className={styles.sectionHead}>
        <div>
          <span className={styles.eyebrow}>경제 캘린더</span>
          <h2>미리 챙기는 일정</h2>
        </div>
        <span className={styles.note}>한국시간</span>
      </div>
      <div className={styles.calendar}>
        {events.map((event) => (
          <a
            key={event.id}
            href={event.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <time dateTime={event.at}>
              <strong>
                {new Intl.DateTimeFormat("en-US", {
                  day: "2-digit",
                  timeZone: "Asia/Seoul",
                }).format(new Date(event.at))}
              </strong>
              <span>
                {new Intl.DateTimeFormat("ko-KR", {
                  month: "numeric",
                  weekday: "short",
                  timeZone: "Asia/Seoul",
                }).format(new Date(event.at))}
              </span>
            </time>
            <div>
              <strong>{event.title}</strong>
              <p>{event.detail}</p>
              <small>
                {new Intl.DateTimeFormat("ko-KR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                  timeZone: "Asia/Seoul",
                }).format(new Date(event.at))}{" "}
                발표 예정
              </small>
            </div>
            <span>↗</span>
          </a>
        ))}
      </div>
      {!events.length && (
        <p className={styles.empty}>
          등록된 예정 일정이 없어요. 공식 발표 달력을 확인해 주세요.
        </p>
      )}
      <div className={styles.calendarFoot}>
        <span>공식 일정 확인 · {CALENDAR_REVIEWED_AT}</span>
        <a
          href="https://www.bls.gov/schedule/"
          target="_blank"
          rel="noopener noreferrer"
        >
          전체 일정 ↗
        </a>
      </div>
    </section>
  );
}
