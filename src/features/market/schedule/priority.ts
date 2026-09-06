import type { ExchangeCalendar } from "./types";
import { getMarketSession } from "./session";
import { localParts } from "./time";

const hour = 3_600_000;
export function rankMarketSessions(calendars: ExchangeCalendar[], now: number) {
  return calendars.map((calendar, order) => {
    const state = getMarketSession(calendar, now);
    const remaining = state.nextAt === undefined ? Infinity : state.nextAt - now;
    const date = Number.isFinite(now) ? localParts(now, calendar.timeZone).date : "";
    const holiday = calendar.holidays[date], special = calendar.overrides[date];
    const upcomingHoliday = state.skippedHoliday && remaining <= 96 * hour;
    const alert = holiday ? { label: `${holiday} 휴장`, date } :
      special ? { label: special.reason, date } :
      upcomingHoliday ? { label: `${state.skippedHoliday} 휴장 예정`, date: state.skippedHolidayDate } : undefined;
    const priority = remaining > 0 && remaining <= hour ? 0 :
      state.status === "open" || state.status === "auction" ? 1 :
      state.status === "waiting" || state.status === "break" ? 2 :
      state.status === "unknown" ? 3 : 4;
    return { calendar, state, priority, alert, order, remaining };
  }).sort((a, b) => a.priority - b.priority || a.remaining - b.remaining || a.order - b.order);
}
export type RankedMarketSession = ReturnType<typeof rankMarketSessions>[number];
