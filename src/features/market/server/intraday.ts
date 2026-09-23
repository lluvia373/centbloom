import type { ChartResultArray } from "yahoo-finance2/modules/chart";
import { marketForSymbol } from "@/lib/markets";
import { addCalendarDays, kstDate } from "@/lib/performance";
import { fxCutoff, fxPair, sameFxPair, usdLeg } from "../fx";
import type { IntradayInterval, IntradayPoint, IntradayRange, IntradaySeries } from "../intraday";
import { calendars } from "../schedule/calendars";
import { isWeekend, localInstant, localParts } from "../schedule/time";
import { midnightPricePlan } from "./midnight-price";
import { MarketError, providerRequests, validDate, validSymbol, yahoo } from "./provider";

const MINUTE = 60_000;
const DAY = 86_400_000;
type RawChart = Pick<ChartResultArray, "meta" | "quotes">;
type Sample = { start: number; end: number; close: number };
const positive = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

export function intradayWindow(range: IntradayRange, day: string, now: number) {
  if (!["1d", "5d"].includes(range) || !validDate(day) || day !== kstDate(new Date(now)))
    throw new MarketError("오늘 기준의 1일 또는 5일 조회가 필요합니다.", 400);
  const interval: IntradayInterval = range === "1d" ? "1m" : "30m";
  const step = (range === "1d" ? 1 : 30) * MINUTE;
  const start = Date.parse(`${range === "1d" ? day : addCalendarDays(day, -4)}T00:00:00+09:00`);
  return { interval, step, start, end: Math.floor(now / step) * step };
}

function checkChart(symbol: string, result: RawChart, interval: string, currency?: string) {
  const pair = fxPair(symbol);
  const meta = result.meta;
  if (!(pair ? sameFxPair(symbol, meta?.symbol ?? "") : meta?.symbol?.toUpperCase() === symbol) ||
    meta?.dataGranularity !== interval || typeof meta?.currency !== "string" ||
    !/^[A-Za-z]{3}$/.test(meta.currency) || (currency && meta.currency !== currency) ||
    (pair && (meta.instrumentType !== "CURRENCY" || meta.currency !== pair.quote)))
    throw new MarketError("분 단위 시세의 종목·통화·시간 단위를 확인하지 못했습니다.", 502);
  return meta.currency;
}

/** Reject live quote markers and bars outside a verified regular trading window. */
function alignedBar(symbol: string, at: number, step: number) {
  if (at % MINUTE !== 0) return false;
  if (fxPair(symbol)) return at % step === 0;
  const calendar = calendars.find(c => c.id === marketForSymbol(symbol).toUpperCase());
  if (!calendar) return at % step === 0;
  const { date } = localParts(at, calendar.timeZone);
  if (date < calendar.validFrom || date > calendar.validThrough) return at % step === 0;
  if (isWeekend(date) || calendar.holidays[date]) return false;
  const override = calendar.overrides[date];
  if (override && !override.windows) return false;
  return (override?.windows ?? calendar.windows).some(window => {
    const start = localInstant(date, window.start, calendar.timeZone);
    const end = localInstant(date, window.end, calendar.timeZone);
    return at >= start && at + step <= end && (at - start) % step === 0;
  });
}

function samples(symbol: string, raw: RawChart, step: number, now: number): Sample[] {
  return (raw.quotes ?? []).flatMap(q => {
    const start = q.date?.getTime();
    return Number.isFinite(start) && alignedBar(symbol, start, step) && start + step <= now && positive(q.close)
      ? [{ start, end: start + step, close: q.close }] : [];
  }).sort((a, b) => a.end - b.end);
}

/** Each grid point is an as-of valuation. Missing intervals remain explicit gaps. */
export function selectIntradaySeries(
  symbol: string, range: IntradayRange, day: string, now: number, raw: RawChart, daily?: RawChart,
): IntradaySeries {
  const window = intradayWindow(range, day, now);
  const currency = checkChart(symbol, raw, window.interval);
  if (daily) checkChart(symbol, daily, "1d", currency);
  const rows = samples(symbol, raw, window.step, now);
  const points: IntradayPoint[] = [];
  let cursor = -1;
  for (let at = window.start; at <= window.end; at += window.step) {
    while (cursor + 1 < rows.length && rows[cursor + 1].end <= at) cursor++;
    const row = rows[cursor];
    let chosen: { close: number; sourceAt: number } | null = null;
    if (fxPair(symbol)) {
      const cutoff = fxCutoff(at);
      // An absent earlier weekday is not evidence of a holiday. Only a recent,
      // completed bar at the verified weekly close can persist over the weekend.
      const relevant = cutoff.closed ? rows.findLast(r => r.end <= cutoff.at) : row;
      const maxLag = cutoff.closed ? Math.max(window.step, 5 * MINUTE) : window.step;
      if (relevant && relevant.end <= cutoff.at && cutoff.at - relevant.end < maxLag)
        chosen = { close: relevant.close, sourceAt: relevant.start };
    } else {
      const plan = midnightPricePlan(symbol, at);
      if (plan.kind === "session-close") {
        // A daily timestamp is a session label, not when its close was known.
        const close = daily?.quotes?.find(q => positive(q.close) && Number.isFinite(q.date?.getTime()) &&
          q.date.getTime() <= plan.end && localParts(q.date.getTime(), plan.timeZone).date === plan.date);
        if (close && plan.end <= at) chosen = { close: close.close!, sourceAt: close.date.getTime() };
      } else if (plan.kind === "minute" && row && at - row.end < window.step) {
        chosen = { close: row.close, sourceAt: row.start };
      }
    }
    points.push({ at: new Date(at).toISOString(), close: chosen?.close ?? null,
      sourceAt: chosen ? new Date(chosen.sourceAt).toISOString() : null,
      ...(!chosen ? { reason: "missing-completed-price" } : {}) });
  }
  return { symbol, currency, interval: window.interval, startAt: new Date(window.start).toISOString(),
    endAt: new Date(window.end).toISOString(), fetchedAt: new Date(now).toISOString(), points };
}

async function chart(symbol: string, interval: IntradayInterval | "1d", since: number, until: number, signal?: AbortSignal) {
  // Only the daily auxiliary request ends at an unrounded current instant.
  // Completed sessions cannot change inside a minute; a new minute gets a new
  // key so a close fetched before the session ended is never carried past it.
  // Keep the actual provider window and the existing one-minute TTL unchanged.
  const cacheUntil = interval === "1d" ? Math.floor(until / MINUTE) * MINUTE : until;
  return providerRequests.request(JSON.stringify(["intraday-source-v2", symbol, interval, since, cacheUntil]), s =>
    yahoo.chart(symbol, { period1: new Date(since), period2: new Date(until), interval, includePrePost: false },
      { fetchOptions: { signal: s } }), { signal, ttlMs: 60_000, timeoutMs: 20_000 });
}

async function optional<T>(load: () => Promise<T>, signal?: AbortSignal): Promise<T | null> {
  try { return await load(); } catch { signal?.throwIfAborted(); return null; }
}

/** Leaf requests share the existing provider queue; cross-rate fanout holds no queue slot. */
export async function fetchIntradayChart(
  rawSymbol: string, range: IntradayRange, day: string, signal?: AbortSignal, now = Date.now(),
): Promise<IntradaySeries> {
  const symbol = rawSymbol.trim().toUpperCase();
  if (!validSymbol(symbol)) throw new MarketError("유효한 종목 코드가 필요합니다.", 400);
  const window = intradayWindow(range, day, now);
  // 1m requests stay below seven days; 30m stays far below the provider's recent-history limit.
  const since = range === "1d" ? window.end - 6 * DAY : window.start - 7 * DAY;
  const pair = fxPair(symbol);
  const [raw, daily] = await Promise.all([
    optional(() => chart(symbol, window.interval, since, window.end + 1, signal), signal),
    pair ? null : optional(() => chart(symbol, "1d", window.start - 40 * DAY, now, signal), signal),
  ]);
  signal?.throwIfAborted();
  let result: IntradaySeries | null = raw ? selectIntradaySeries(symbol, range, day, now, raw, daily ?? undefined) : null;
  if (pair && pair.base !== "USD" && pair.quote !== "USD" && (!result || result.points.some(p => p.close == null))) {
    const base = usdLeg(pair.base), quote = usdLeg(pair.quote);
    const [left, right] = await Promise.all([
      optional(() => fetchIntradayChart(base.symbol, range, day, signal, now), signal),
      optional(() => fetchIntradayChart(quote.symbol, range, day, signal, now), signal),
    ]);
    signal?.throwIfAborted();
    if (left && right) {
      const rightByTime = new Map(right.points.map(p => [p.at, p]));
      const points = left.points.map(a => {
        const b = rightByTime.get(a.at);
        const value = positive(a.close) && positive(b?.close) && a.sourceAt && a.sourceAt === b.sourceAt
          ? (quote.inverted ? 1 / b.close : b.close) / (base.inverted ? 1 / a.close : a.close) : null;
        return { at: a.at, close: positive(value) ? value : null,
          sourceAt: positive(value) ? a.sourceAt : null, ...(!positive(value) ? { reason: "missing-matched-fx" } : {}) };
      });
      if (result) result = { ...result, points: result.points.map((p, index) => p.close != null ? p : points[index]) };
      else result = { ...left, symbol, currency: pair.quote, points };
    }
  }
  if (!result) throw new MarketError("분 단위 시세를 불러오지 못했습니다.", 503);
  return result;
}
