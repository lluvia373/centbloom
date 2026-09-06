import { WeekCalendar } from "@/features/calendar/WeekCalendar";
import styles from "./home.module.css";
export function MarketCalendar({now}: {now:number}) {
  return <section className={styles.panel} aria-label="이번 주 일정"><WeekCalendar now={now}/></section>;
}
