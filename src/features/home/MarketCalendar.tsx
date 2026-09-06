import { WeekCalendar } from "@/features/calendar/WeekCalendar";
import { HomeSection } from "./HomeSection";
import styles from "./home.module.css";

export function MarketCalendar({now}: {now:number}) {
  return <HomeSection title="이번 주 일정" actions={<span className={styles.sectionMeta}>KST</span>}>
    <WeekCalendar now={now}/>
  </HomeSection>;
}
