import type { ExchangeCalendar } from "./types";
import { addDays, isWeekend, localInstant, localParts } from "./time";

export interface MarketSession {
  status: "open" | "closed" | "waiting" | "break" | "auction" | "unknown";
  label: string;
  reason: string;
  nextAt?: number;
  nextAction?: "개장" | "재개" | "마감" | "마감 경매" | "점심 휴장";
  skippedHoliday?: string;
  skippedHolidayDate?: string;
}
function known(calendar: ExchangeCalendar, date: string) {
  return date >= calendar.validFrom && date <= calendar.validThrough;
}
function nextOpening(calendar: ExchangeCalendar, date: string) {
  let skippedHoliday: string | undefined;
  let skippedHolidayDate: string | undefined;
  for (let offset = 1; offset <= 40; offset++) {
    const day = addDays(date, offset);
    if (!known(calendar, day)) break;
    const holiday = calendar.holidays[day];
    if (holiday) { if (!skippedHoliday) { skippedHoliday = holiday; skippedHolidayDate = day; } continue; }
    if (isWeekend(day)) continue;
    const override = calendar.overrides[day];
    if (override && !override.windows) break; // Unknown special day blocks a guessed opening.
    const window = (override?.windows ?? calendar.windows)[0];
    return {nextAt:localInstant(day,window.start,calendar.timeZone),nextAction:"개장" as const,skippedHoliday,skippedHolidayDate};
  }
  return { skippedHoliday, skippedHolidayDate };
}
/** Published cash-equity schedule, not a real-time exchange halt feed. */
export function getMarketSession(calendar: ExchangeCalendar, now: number): MarketSession {
  if (!Number.isFinite(now)) return {status:"unknown",label:"일정 확인 중",reason:"기준 시각 미제공"};
  const {date,minute} = localParts(now,calendar.timeZone);
  if (!known(calendar,date)) return {status:"unknown",label:"일정 확인 중",reason:"해당 연도 거래소 일정 미등록"};
  const holiday = calendar.holidays[date];
  if (holiday) return {status:"closed",label:holiday+" 휴장",reason:holiday,...nextOpening(calendar,date)};
  if (isWeekend(date)) return {status:"closed",label:"주말 휴장",reason:"거래소 현지 토·일요일",...nextOpening(calendar,date)};
  const override = calendar.overrides[date];
  if (override && !override.windows) return {status:"unknown",label:"거래시간 확인 중",reason:override.reason};
  const windows = override?.windows ?? calendar.windows;
  const first = windows[0];
  if (minute < first.start) return {
    status:"waiting",label:"개장 전",reason:override?.reason ?? "정규장 시작 전",
    nextAt:localInstant(date,first.start,calendar.timeZone),nextAction:"개장",
  };
  for (let i=0;i<windows.length;i++) {
    const window=windows[i];
    if (minute >= window.start && minute < window.end) return {
      status:window.auction?"auction":"open",label:window.auction ? (minute >= window.end - 2 ? "마감 확인 중" : "마감 경매") : "정규장",
      reason:window.auction?"HKEX 마감 경매는 마지막 2분 사이 무작위 종료":override?.reason ?? "정규 거래 일정",
      nextAt:localInstant(date,window.end,calendar.timeZone),
      nextAction: windows[i+1]?.auction ? "마감 경매" : i === windows.length-1 ? "마감" : "점심 휴장",
    };
    const next=windows[i+1];
    if (next && minute >= window.end && minute < next.start) return {
      status:"break",label:"점심 휴장",reason:"오전장과 오후장 사이 휴식",
      nextAt:localInstant(date,next.start,calendar.timeZone),nextAction:"재개",
    };
  }
  return {status:"closed",label:override?"조기 마감":"장 마감",reason:override?.reason ?? "오늘 정규장 종료",...nextOpening(calendar,date)};
}
