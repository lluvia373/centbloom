import type { DayOverride } from "./types";

// Explicitly verified calendar year. Do not roll forward by changing this alone.
export const year = { validFrom: "2026-01-01", validThrough: "2026-12-31" };
export function holidays(entries: [string, string][]): Record<string, string> {
  return Object.fromEntries(entries.map(([date, reason]) => ["2026-" + date, reason]));
}
export function holidayRanges(entries: [string, string, string][]) {
  const result: Record<string, string> = {};
  for (const [start, end, reason] of entries) {
    for (let day = Date.parse("2026-" + start + "T00:00:00Z"); day <= Date.parse("2026-" + end + "T00:00:00Z"); day += 86400000)
      result[new Date(day).toISOString().slice(0, 10)] = reason;
  }
  return result;
}
export function shortened(dates: string[], start: number, end: number): Record<string, DayOverride> {
  return Object.fromEntries(dates.map(date => ["2026-" + date, { reason: "단축 거래일", windows: [{ start, end }] }]));
}
