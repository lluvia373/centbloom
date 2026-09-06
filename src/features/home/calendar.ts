// Editorially verified official releases. Never roll dates forward or invent future events.
export const CALENDAR_REVIEWED_AT = "2026-09-06";
const source = "https://www.bls.gov/schedule/2026/09_sched.htm";
export const marketEvents = [
  {
    id: "ppi-2026-09",
    at: "2026-09-10T12:30:00Z",
    title: "미국 생산자물가지수",
    detail: "8월 PPI · 미국 노동통계국",
    url: source,
  },
  {
    id: "cpi-2026-09",
    at: "2026-09-11T12:30:00Z",
    title: "미국 소비자물가지수",
    detail: "8월 CPI · 미국 노동통계국",
    url: source,
  },
  {
    id: "import-2026-09",
    at: "2026-09-16T12:30:00Z",
    title: "미국 수출입물가지수",
    detail: "8월 수출입물가 · 미국 노동통계국",
    url: source,
  },
];
export function upcomingEvents(now: number) {
  return marketEvents
    .filter((event) => Date.parse(event.at) >= now)
    .slice(0, 3);
}
