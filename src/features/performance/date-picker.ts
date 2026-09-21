/** Calendar-only values: never convert through the viewer's local time zone. */
export function parseCalendarInput(value: string): string | null {
  const compact = value.replace(/\s/g, "");
  const match = /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\.?$/.exec(compact) ?? /^(\d{4})(\d{2})(\d{2})$/.exec(compact);
  if (!match) return null;
  const iso = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  const timestamp = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === iso ? iso : null;
}

export function formatCalendarInput(value: string): string {
  return value.replaceAll("-", ".");
}

export function shiftCalendarDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function shiftCalendarMonth(value: string, months: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const last = new Date(date);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  date.setUTCDate(Math.min(day, last.getUTCDate()));
  return date.toISOString().slice(0, 10);
}

export function calendarWeeks(month: string): string[][] {
  const first = `${month}-01`;
  const weekday = new Date(`${first}T00:00:00Z`).getUTCDay();
  const start = shiftCalendarDate(first, -weekday);
  return Array.from({ length: 6 }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => shiftCalendarDate(start, week * 7 + day)),
  );
}

export function clampCalendarDate(value: string, min: string, max: string): string {
  return value < min ? min : value > max ? max : value;
}
