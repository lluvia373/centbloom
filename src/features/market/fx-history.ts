import type { ChartPoint } from "@/lib/types";

export interface DailyFxPoint extends ChartPoint {
  referenceDate: string;
  carried: boolean;
  source: "ecb-reference";
}
export interface DailyFxSeries {
  currency: string;
  baseCurrency: "KRW";
  method: "daily-reference";
  source: "ecb-reference";
  points: DailyFxPoint[];
}
/** Only actual publication dates are stored. Weekend rows are derived on read. */
export interface FxReferenceDay {
  date: string;
  rates: Record<string, number>; // KRW per ONE unit (JPY is not per 100).
}
export const FX_HISTORY_FIRST_DATE = "1999-01-04";
export const FX_HISTORY_MAX_CARRY_DAYS = 7;
export const FX_REFERENCE_SOURCE_URL = "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html";

export function validFxDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) &&
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
}
export function shiftFxDate(date: string, offset: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
}
export function fxToday(now = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
function easter(year: number): string {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = (h + l - 7 * m + 114) % 31 + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
/** TARGET publication calendar, not the holiday calendar of a stock exchange. */
export function isFxReferenceHoliday(date: string): boolean {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6) return true;
  if (["1999-12-31", "2001-12-31"].includes(date)) return true;
  const md = date.slice(5), year = Number(date.slice(0, 4));
  if (["01-01", "12-25"].includes(md)) return true;
  if (year < 2000) return false;
  return ["05-01", "12-26"].includes(md) ||
    [shiftFxDate(easter(year), -2), shiftFxDate(easter(year), 1)].includes(date);
}

/** Reject truncated/ambiguous documents; never turn a missing currency into a rate. */
export function parseDailyFxReferences(xml: string): FxReferenceDay[] {
  if (!xml.includes("http://www.ecb.int/vocabulary/2002-08-01/eurofxref") ||
    !/<\/(?:gesmes:)?Envelope>\s*$/.test(xml)) throw new Error("공식 일별 환율 자료 형식을 확인하지 못했습니다.");
  const days = new Map<string, FxReferenceDay>();
  for (const match of xml.matchAll(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]\s*>([\s\S]*?)<\/Cube>/g)) {
    const date = match[1];
    if (!validFxDate(date) || date < FX_HISTORY_FIRST_DATE || days.has(date)) throw new Error("공식 일별 환율의 날짜를 확인하지 못했습니다.");
    const euroRates: Record<string, number> = { EUR: 1 };
    for (const rate of match[2].matchAll(/<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([^'"]*)['"]\s*\/>/g)) {
      const value = Number(rate[2]);
      if (rate[1] in euroRates || !Number.isFinite(value) || value <= 0) throw new Error("공식 일별 환율에 올바르지 않은 값이 있습니다.");
      euroRates[rate[1]] = value;
    }
    // Keep an empty day when KRW is missing so no earlier rate can silently cover it.
    const rates = euroRates.KRW ? Object.fromEntries(Object.entries(euroRates)
      .map(([currency, value]) => [currency, euroRates.KRW / value])) : {};
    days.set(date, { date, rates });
  }
  if (!days.size) throw new Error("공식 일별 환율 자료가 비어 있습니다.");
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function buildDailyFxSeries(currency: string, start: string, end: string, days: FxReferenceDay[], now = Date.now()): DailyFxSeries {
  const today = fxToday(now);
  if (!/^[A-Z]{3}$/.test(currency) || !validFxDate(start) || !validFxDate(end) || start > end ||
    start < FX_HISTORY_FIRST_DATE || end > today) throw new Error("유효한 통화와 과거 환율 조회 기간이 필요합니다.");
  const byDate = new Map(days.map(day => [day.date, day]));
  const points: DailyFxPoint[] = [];
  for (let date = start; date <= end; date = shiftFxDate(date, 1)) {
    if (currency === "KRW") {
      points.push({ date, close: 1, referenceDate: date, carried: false, source: "ecb-reference" });
      continue;
    }
    // A day still in progress is not a finalized daily observation. Live valuation
    // obtains a separate current quote; do not consume a future/full-day average.
    let referenceDate = date === today ? shiftFxDate(date, -1) : date;
    let row = byDate.get(referenceDate);
    for (let age = date === today ? 1 : 0; !row && age < FX_HISTORY_MAX_CARRY_DAYS && isFxReferenceHoliday(referenceDate); age++) {
      referenceDate = shiftFxDate(referenceDate, -1);
      row = byDate.get(referenceDate);
    }
    const rate = row?.rates[currency];
    const age = (Date.parse(date) - Date.parse(referenceDate)) / 86400000;
    if (!Number.isFinite(rate) || !(rate! > 0) || age > FX_HISTORY_MAX_CARRY_DAYS) {
      throw new Error(`${date} ${currency}→KRW 일별 기준환율을 확인하지 못했습니다. (필요 자료: ${referenceDate})`);
    }
    points.push({ date, close: rate!, referenceDate, carried: referenceDate !== date, source: "ecb-reference" });
  }
  return { currency, baseCurrency: "KRW", method: "daily-reference", source: "ecb-reference", points };
}
