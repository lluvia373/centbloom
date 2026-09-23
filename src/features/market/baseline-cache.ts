import type { MidnightBaseline } from "./baseline";
import { FX_HISTORY_MAX_CARRY_DAYS, fxToday, validFxDate } from "./fx-history";

const BASELINE_TTL_MS = 5 * 60_000;
type Entry = { value: MidnightBaseline; fetchedAt: number; expiresAt: number };

/** Cache admission only; price selection and portfolio calculations stay with their owners. */
function reusable(value: MidnightBaseline, symbol: string, date: string, now: number): boolean {
  const cutoff = Date.parse(`${date}T00:00:00+09:00`);
  const fetchedAt = Date.parse(value?.fetchedAt);
  if (!value || value.symbol !== symbol || value.date !== date ||
    value.status !== "available" || !Number.isFinite(value.price) || !(value.price! > 0) ||
    typeof value.currency !== "string" || !value.currency.trim() ||
    Date.parse(value.baselineAt) !== cutoff || !Number.isFinite(fetchedAt) ||
    fetchedAt < cutoff || fetchedAt > now || now - fetchedAt >= BASELINE_TTL_MS) return false;
  if (value.precision === "daily-reference") {
    const referenceDate = value.fx?.referenceDate;
    return value.source === "ecb-reference" && value.fx?.method === "ecb-reference" &&
      value.sourceAt === null && value.sourceEndAt === null &&
      !!referenceDate && validFxDate(referenceDate) && referenceDate < date &&
      cutoff - Date.parse(`${referenceDate}T00:00:00+09:00`) <= FX_HISTORY_MAX_CARRY_DAYS * 86_400_000 &&
      (!value.fx.publishedAt || Date.parse(value.fx.publishedAt) <= cutoff);
  }
  const start = Date.parse(value.sourceAt ?? ""), end = Date.parse(value.sourceEndAt ?? "");
  return value.source === "yahoo-chart" &&
    (value.precision === "minute" || value.precision === "session-close") &&
    Number.isFinite(start) && Number.isFinite(end) && start <= end && end <= cutoff;
}

/** Public symbol/date results only: no account, transaction, polling, or persistent storage. */
export function createBaselineCache({ now = Date.now, maxEntries = 256 } = {}) {
  if (!Number.isInteger(maxEntries) || maxEntries < 1) throw new RangeError("Invalid baseline cache limit");
  const entries = new Map<string, Entry>();
  const key = (symbol: string, date: string) => JSON.stringify([symbol, date]);
  const prune = (at: number, today: string) => {
    for (const [id, entry] of entries) {
      if (entry.value.date !== today || entry.expiresAt <= at || entry.fetchedAt > at) entries.delete(id);
    }
  };
  return {
    get(symbol: string, date: string): MidnightBaseline | undefined {
      const at = now(), today = fxToday(at);
      prune(at, today);
      if (date !== today) return undefined;
      const id = key(symbol, date), entry = entries.get(id);
      if (!entry) return undefined;
      // Keep recently used instruments when the bounded public cache fills up.
      entries.delete(id);
      entries.set(id, entry);
      return entry.value;
    },
    set(symbol: string, date: string, value: MidnightBaseline): void {
      const at = now(), today = fxToday(at);
      prune(at, today);
      if (date !== today || !reusable(value, symbol, date, at)) return;
      const id = key(symbol, date), fetchedAt = Date.parse(value.fetchedAt);
      if ((entries.get(id)?.fetchedAt ?? -Infinity) > fetchedAt) return;
      entries.delete(id);
      // Preserve the provider's fetch time, so an already cached server result
      // cannot receive another full five minutes and delay a correction twice.
      entries.set(id, { value, fetchedAt, expiresAt: fetchedAt + BASELINE_TTL_MS });
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value!);
    },
  };
}
