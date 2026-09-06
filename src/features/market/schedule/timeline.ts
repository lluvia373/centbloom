import type { ExchangeCalendar } from "./types";
import { addDays, isWeekend, localInstant, localParts } from "./time";

const dayMs = 86_400_000;
export const timelineHours = [0, 6, 12, 18, 24] as const;
export function kstTimelineDay(now: number) {
  const { date } = localParts(now, "Asia/Seoul");
  const start = localInstant(date, 0, "Asia/Seoul");
  return { date, start, end: start + dayMs, progress: (now - start) / dayMs * 100 };
}
export type TimelineDay = ReturnType<typeof kstTimelineDay>;
export interface SessionSegment {
  startAt: number;
  endAt: number;
  left: number;
  width: number;
  auction: boolean;
  label: string;
}
function clock(at: number, day: TimelineDay) {
  if (at === day.end) return "24:00";
  const { minute } = localParts(at, "Asia/Seoul");
  return String(Math.floor(minute / 60)).padStart(2, "0") + ":" + String(minute % 60).padStart(2, "0");
}
/** Clip actual exchange-local sessions into one KST day, including the preceding US session. */
export function marketTimeline(calendar: ExchangeCalendar, day: TimelineDay) {
  const segments: SessionSegment[] = [];
  const holidays = new Set<string>();
  let uncertain = false;
  const last = localParts(day.end - 1, calendar.timeZone).date;
  for (let date = localParts(day.start, calendar.timeZone).date; date <= last; date = addDays(date, 1)) {
    if (date < calendar.validFrom || date > calendar.validThrough) { uncertain = true; continue; }
    const holiday = calendar.holidays[date];
    if (holiday) { holidays.add(holiday); continue; }
    if (isWeekend(date)) continue;
    const override = calendar.overrides[date];
    if (override && !override.windows) { uncertain = true; continue; }
    for (const window of override?.windows ?? calendar.windows) {
      const actualStart = localInstant(date, window.start, calendar.timeZone);
      const actualEnd = localInstant(date, window.end, calendar.timeZone);
      const startAt = Math.max(day.start, actualStart);
      const endAt = Math.min(day.end, actualEnd);
      if (startAt >= endAt) continue;
      const label = `${clock(startAt, day)}–${clock(endAt, day)}${window.auction ? " 마감 경매(이내 종료)" : ""}${actualStart < day.start ? " · 전날부터" : ""}${actualEnd > day.end ? " · 다음 날까지" : ""}`;
      segments.push({ startAt, endAt, left: (startAt - day.start) / dayMs * 100,
        width: (endAt - startAt) / dayMs * 100, auction: Boolean(window.auction), label });
    }
  }
  return {
    segments, uncertain,
    emptyLabel: uncertain ? "거래시간 확인 중" : holidays.size ? [...holidays].join(" · ") + " 휴장" : "오늘 거래 없음",
    description: segments.map(segment => segment.label).join(", ") + (uncertain ? " · 일부 시간 미확인" : ""),
  };
}
