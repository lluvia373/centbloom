import type { Release } from "./release";
import { kstDate } from "./model";
export type EventFilter = "all" | "earnings" | "economic";
export function eventFilter(value: string | null | undefined): EventFilter {
  return value === "earnings" || value === "economic" ? value : "all";
}
export function validDay(value: string | null | undefined): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
export function shiftDay(day: string, offset: number) {
  return new Date(Date.parse(day + "T00:00:00Z") + offset * 86400_000).toISOString().slice(0,10);
}
export function weekDays(day: string) {
  const weekday = new Date(day + "T00:00:00Z").getUTCDay();
  const monday = shiftDay(day, -((weekday + 6) % 7));
  return Array.from({length:7}, (_,index) => shiftDay(monday,index));
}
export function filterEvents(events: Release[], kind: EventFilter) {
  return events.filter(event => kind === "all" || (event.kind ?? "economic") === kind);
}
export function onDay(events: Release[], day: string) {
  return events.filter(event => kstDate(event.at) === day).sort((a,b) => Date.parse(a.at)-Date.parse(b.at));
}
export function calendarHref(day: string, kind: EventFilter = "all") {
  return "/calendar?" + new URLSearchParams({month:day.slice(0,7),day,type:kind});
}
/** Accept only our calendar or home URL; never an external return target. */
export function safeReturn(value: string | null | undefined, fallback = "/calendar") {
  if (!value || !/^\/(?:calendar)?(?:\?|$)/.test(value)) return fallback;
  try {
    const url = new URL(value,"https://centifolio.invalid");
    if (url.origin !== "https://centifolio.invalid" || !["/","/calendar"].includes(url.pathname)) return fallback;
    return url.pathname + url.search;
  } catch { return fallback; }
}
export function eventHref(event: Release, from: string) {
  return "/calendar/" + encodeURIComponent(event.id) + "?" + new URLSearchParams({from:safeReturn(from)});
}
