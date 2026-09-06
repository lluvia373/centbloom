import type { RankedMarketSession } from "./priority";
import { addDays, localParts } from "./time";

/** Only exceptional schedules get a banner; ordinary transitions stay in their rows. */
export function groupSessionAlerts(items: RankedMarketSession[]) {
  const groups = new Map<string, RankedMarketSession[]>();
  for (const item of items) {
    if (!item.alert) continue;
    const key = JSON.stringify([item.alert.label, item.alert.date, item.state.status, item.state.nextAt, item.state.nextAction]);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return Array.from(groups.values());
}

const primaryMarkets = ["US", "KR", "JP", "HK", "GB", "DE"];
/** Keep market rows stable for comparison; only exceptional alerts are ranked by time. */
export function visibleMarketSessions(items: RankedMarketSession[], region: string, expanded: boolean) {
  const filtered = items.filter(item => region === "전체" || item.calendar.region === region);
  const order = (id: string, fallback: number) => {
    const index = region === "전체" ? primaryMarkets.indexOf(id) : -1;
    return index < 0 ? primaryMarkets.length + fallback : index;
  };
  const ordered = [...filtered].sort((a, b) => order(a.calendar.id, a.order) - order(b.calendar.id, b.order));
  return { rows: expanded ? ordered : ordered.slice(0, 6), total: ordered.length };
}

export function sessionTransition(item: RankedMarketSession, now: number) {
  const { state } = item;
  if (!Number.isFinite(now) || state.nextAt === undefined || !Number.isFinite(state.nextAt)) {
    return { primary: "다음 일정 확인 중", clock: "", imminent: false };
  }
  const next = localParts(state.nextAt, "Asia/Seoul");
  const today = localParts(now, "Asia/Seoul").date;
  const time = `${String(Math.floor(next.minute / 60)).padStart(2, "0")}:${String(next.minute % 60).padStart(2, "0")}`;
  const day = next.date === today ? "오늘" : next.date === addDays(today, 1) ? "내일" :
    `${Number(next.date.slice(5, 7))}. ${Number(next.date.slice(8))}.`;
  const absolute = `${day} ${time}`;
  // HKEX may close at any point in the final two minutes, not at an exact countdown.
  if (state.status === "auction") return { primary: `${absolute}까지 마감`, clock: "", imminent: false };
  const remaining = state.nextAt - now;
  if (remaining <= 0) return { primary: "일정 갱신 중", clock: "", imminent: false };
  const minutes = Math.ceil(remaining / 60_000);
  if (minutes <= 360) {
    const hours = Math.floor(minutes / 60), rest = minutes % 60;
    const duration = hours ? `${hours}시간${rest ? ` ${rest}분` : ""}` : `${minutes}분`;
    return { primary: `${duration} 후 ${state.nextAction}`, clock: absolute, imminent: minutes <= 60 };
  }
  return { primary: `${absolute} ${state.nextAction}`, clock: "", imminent: false };
}
