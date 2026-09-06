import type { RankedMarketSession } from "./priority";
import { localParts } from "./time";

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

const primaryMarkets = ["US", "KR", "JP", "CN", "HK", "DE"];
/** Show only the six primary markets, in a stable order. */
export function visibleMarketSessions(items: RankedMarketSession[]) {
  return primaryMarkets.flatMap(id => {
    const item = items.find(item => item.calendar.id === id);
    return item ? [item] : [];
  });
}

export function sessionTransition(item: RankedMarketSession, now: number) {
  const { state } = item;
  if (!Number.isFinite(now) || state.nextAt === undefined || !Number.isFinite(state.nextAt)) {
    return { primary: "다음 일정 확인 중", clock: "", imminent: false };
  }
  const next = localParts(state.nextAt, "Asia/Seoul");
  const time = `${String(Math.floor(next.minute / 60)).padStart(2, "0")}:${String(next.minute % 60).padStart(2, "0")}`;
  const date = `${Number(next.date.slice(5, 7))}/${Number(next.date.slice(8))}`;
  const absolute = `${date} ${time}`;
  // HKEX may close at any point in the final two minutes, not at an exact countdown.
  if (state.status === "auction") return { primary: `${absolute}까지 마감`, clock: "", imminent: false };
  const remaining = state.nextAt - now;
  if (remaining <= 0) return { primary: "일정 갱신 중", clock: "", imminent: false };
  return { primary: `${absolute} ${state.nextAction}`, clock: "", imminent: remaining <= 3_600_000 };
}
