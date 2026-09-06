// Convert exchange-local wall time with IANA time zones, including US DST.
// Session boundaries are daytime hours, outside ambiguous DST transition hours.
const formatters = new Map<string, Intl.DateTimeFormat>();
export function localParts(now: number, timeZone: string) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });
    formatters.set(timeZone, formatter);
  }
  const p = Object.fromEntries(formatter.formatToParts(now).map(p => [p.type, p.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minute: Number(p.hour) * 60 + Number(p.minute) };
}
export function addDays(date: string, count: number) {
  return new Date(Date.parse(date + "T00:00:00Z") + count * 86400000).toISOString().slice(0, 10);
}
export function isWeekend(date: string) {
  const day = new Date(date + "T00:00:00Z").getUTCDay();
  return day === 0 || day === 6;
}
export function localInstant(date: string, minute: number, timeZone: string) {
  const target = Date.parse(date + "T00:00:00Z") + minute * 60000;
  let instant = target;
  for (let i = 0; i < 3; i++) {
    const local = localParts(instant, timeZone);
    const represented = Date.parse(local.date + "T00:00:00Z") + local.minute * 60000;
    instant += target - represented;
  }
  return instant;
}
const kst = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", month: "numeric", day: "numeric",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
export function formatKst(instant: number) { return kst.format(instant); }
