export interface EconomicEvent {
  id: string;
  at: string;
  title: string;
  detail: string;
  source: { label: string; url: string };
}
export const kstDate = (at: string | number) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date(at));
export function groupEvents<T extends EconomicEvent>(events: T[]) {
  const groups = new Map<string, T[]>();
  for (const event of [...events].sort((a, b) => a.at.localeCompare(b.at))) {
    const day = kstDate(event.at);
    groups.set(day, [...(groups.get(day) ?? []), event]);
  }
  return Array.from(groups, ([day, events]) => ({ day, events }));
}
export function eventsInMonth(events: EconomicEvent[], month: string) {
  if (!validMonth(month)) return [];
  return events.filter((event) => kstDate(event.at).startsWith(month));
}
export function validMonth(month: string | undefined): month is string {
  return !!month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}

export function shiftMonth(month: string, offset: number) {
  if (!validMonth(month)) return month;
  const date = new Date(month + "-01T00:00:00Z");
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}
