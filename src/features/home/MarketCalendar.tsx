"use client";

import Link from "next/link";
import { useWatchlist } from "@/hooks/useWatchlist";
import { selectAgenda } from "@/features/calendar/agenda";
import { kstDate } from "@/features/calendar/model";
import { calendarHref } from "@/features/calendar/navigation";
import { preparedCalendarRecords } from "@/features/calendar/records";
import { UpcomingCalendar } from "@/features/calendar/UpcomingCalendar";
import { useCalendarFeed } from "@/features/calendar/use-calendar-feed";
import calendarStyles from "@/features/calendar/upcoming-calendar.module.css";
import { HomeSection } from "./HomeSection";

export function MarketCalendar({ now }: { now: number }) {
  const feed = useCalendarFeed("agenda=" + kstDate(now));
  const watchlist = useWatchlist({ loadQuotes: false });
  const symbols = watchlist.items.map(item => item.symbol);
  const clock = feed.data?.asOf ?? now;
  const agenda = selectAgenda(feed.data?.events ?? preparedCalendarRecords, clock, symbols);
  if (!agenda.upcoming.length && !agenda.recent.length && !feed.failed) return null;

  return <HomeSection title="다가오는 일정" actions={<div className={calendarStyles.headerActions}>
    <span>KST</span>
    <Link href={calendarHref(kstDate(clock))} className={calendarStyles.allLink}>전체 일정 <span aria-hidden="true">→</span></Link>
  </div>}>
    {feed.failed && <p className={calendarStyles.notice} role="status">
      일정을 새로 불러오지 못했어요. <button type="button" onClick={feed.retry}>다시 시도</button>
    </p>}
    <UpcomingCalendar upcoming={agenda.upcoming.slice(0, 3)} recent={agenda.recent.slice(0, 1)} compact />
  </HomeSection>;
}
