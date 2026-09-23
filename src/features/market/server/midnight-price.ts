import type { ChartResultArray } from "yahoo-finance2/modules/chart";
import { marketForSymbol } from "@/lib/markets";
import { kstDate } from "@/lib/performance";
import type { MidnightBaseline } from "../baseline";
import { calendars } from "../schedule/calendars";
import { addDays, isWeekend, localInstant, localParts } from "../schedule/time";
import { MarketError, providerRequests, validDate, validSymbol, yahoo } from "./provider";
import { fxPair } from "../fx";
import { fetchFxBaseline } from "./fx-market";

const MINUTE = 60_000;
const FX_LOOKBACK_MINUTES = 5;
const MAX_SESSION_LOOKBACK_DAYS = 40;
// KRX closing call auctions end at a random instant within 30 seconds of the
// scheduled close: https://global.krx.co.kr/contents/GLB/06/0602/0602010202/GLB0602010202T1.jsp
const KRX_CLOSING_AUCTION_MS = 30_000;

type BaselinePlan =
  | { kind: "minute"; marketClosed: false | null }
  | { kind: "unknown-session" }
  | {
      kind: "session-close";
      date: string;
      timeZone: string;
      dayStart: number;
      end: number;
    };

/** Never infer a completed market session from the age of a price alone. */
export function midnightPricePlan(symbol: string, baselineAt: number): BaselinePlan {
  const market = marketForSymbol(symbol).toUpperCase();
  const calendar = calendars.find((candidate) => candidate.id === market);
  // FX and other instruments need recent timestamped data; the age of a price
  // alone does not establish that an unknown exchange/FX market was closed.
  if (!calendar) return { kind: "minute", marketClosed: null };
  const currentDate = localParts(baselineAt, calendar.timeZone).date;
  for (let offset = 0; offset <= MAX_SESSION_LOOKBACK_DAYS; offset++) {
    const date = addDays(currentDate, -offset);
    if (date < calendar.validFrom || date > calendar.validThrough) {
      return { kind: "minute", marketClosed: null };
    }
    if (isWeekend(date) || calendar.holidays[date]) continue;
    const override = calendar.overrides[date];
    if (override && !override.windows) return { kind: "unknown-session" };
    const windows = override?.windows ?? calendar.windows;
    const start = localInstant(date, windows[0].start, calendar.timeZone);
    const end = localInstant(date, windows[windows.length - 1].end, calendar.timeZone);
    if (baselineAt < start) continue;
    if (baselineAt < end) return { kind: "minute", marketClosed: false };
    return {
      kind: "session-close",
      date,
      timeZone: calendar.timeZone,
      dayStart: localInstant(date, 0, calendar.timeZone),
      end,
    };
  }
  return { kind: "unknown-session" };
}

function emptyBaseline(
  symbol: string,
  date: string,
  fetchedAt: string,
  reason: MidnightBaseline["reason"],
  currency: string | null = null,
): MidnightBaseline {
  return {
    symbol,
    date,
    baselineAt: new Date(`${date}T00:00:00+09:00`).toISOString(),
    currency,
    price: null,
    status: "unavailable",
    precision: null,
    source: "yahoo-chart",
    sourceAt: null,
    sourceEndAt: null,
    cutoffLagSeconds: null,
    marketClosed: null,
    fetchedAt,
    reason,
  };
}

/** Pure selection, including the timestamp filter Yahoo's period2 does not guarantee. */
export function selectMidnightPrice(
  symbol: string,
  date: string,
  result: Pick<ChartResultArray, "meta" | "quotes">,
  fetchedAt: string,
  plan = midnightPricePlan(symbol, Date.parse(`${date}T00:00:00+09:00`)),
): MidnightBaseline {
  const currency = typeof result.meta?.currency === "string" && result.meta.currency.trim()
    ? result.meta.currency
    : null;
  const unavailable = (reason: MidnightBaseline["reason"]) =>
    emptyBaseline(symbol, date, fetchedAt, reason, currency);
  if (!currency) return unavailable("missing-currency");
  if (plan.kind === "unknown-session") return unavailable("unknown-session");
  const interval = plan.kind === "minute" ? "1m" : "1d";
  if (result.meta?.dataGranularity !== interval) return unavailable("unsupported-resolution");
  const baselineAt = Date.parse(`${date}T00:00:00+09:00`);
  const quotes = (result.quotes ?? []).filter((quote) => {
    const time = quote.date?.getTime();
    return Number.isFinite(time) && time <= baselineAt &&
      typeof quote.close === "number" && Number.isFinite(quote.close) && quote.close > 0;
  });
  const sparseFx = symbol.endsWith("=X") && result.meta.instrumentType === "CURRENCY";
  const krClosingAuction = marketForSymbol(symbol) === "kr" && currency === "KRW" &&
    result.meta.symbol?.toUpperCase() === symbol.toUpperCase() &&
    (result.meta.instrumentType === "EQUITY" || result.meta.instrumentType === "ETF");
  const sessionEnd = plan.kind === "session-close"
    ? plan.end + (krClosingAuction ? KRX_CLOSING_AUCTION_MS : 0)
    : baselineAt;
  const price = plan.kind === "minute"
    // FX crosses can contain null minutes between actual quotes. Keep the last
    // completed bar in a bounded five-minute window, retaining its real time.
    // 00:00 bar CLOSE still contains future prices and is never eligible.
    ? quotes.filter((quote) => {
      const time = quote.date.getTime();
      return time % MINUTE === 0 && time + MINUTE <= baselineAt &&
        time >= baselineAt - (sparseFx ? FX_LOOKBACK_MINUTES : 1) * MINUTE;
    }).sort((left, right) => right.date.getTime() - left.date.getTime())[0]
    // A daily timestamp marks the trading date, not the time its closing price
    // became known. Yahoo can also stamp the final closing auction trade.
    // Require the exact session and its full verified closing window to have
    // ended before midnight; later/off-session rows remain ineligible.
    : sessionEnd <= baselineAt ? quotes.find((quote) => quote.date.getTime() <= sessionEnd &&
      localParts(quote.date.getTime(), plan.timeZone).date === plan.date) : undefined;
  if (!price) {
    const completed = quotes.some((quote) => quote.date.getTime() + MINUTE <= baselineAt);
    return unavailable(completed ? "stale-price" : "missing-price");
  }
  const sourceEnd = plan.kind === "minute"
    ? price.date.getTime() + MINUTE : Math.max(plan.end, price.date.getTime());
  return {
    symbol,
    date,
    baselineAt: new Date(baselineAt).toISOString(),
    currency,
    price: price.close!,
    status: "available",
    precision: plan.kind,
    source: "yahoo-chart",
    sourceAt: price.date.toISOString(),
    sourceEndAt: new Date(sourceEnd).toISOString(),
    cutoffLagSeconds: (baselineAt - sourceEnd) / 1000,
    marketClosed: plan.kind === "session-close" ? true : plan.marketClosed,
    fetchedAt,
  };
}

class BaselineUnavailable extends Error {
  constructor(readonly baseline: MidnightBaseline) {
    super(baseline.reason);
  }
}

/** One small public request per canonical instrument/KST date; failures are not cached. */
export async function fetchMidnightBaseline(
  rawSymbol: string,
  date: string,
  signal?: AbortSignal,
  now = new Date(),
): Promise<MidnightBaseline> {
  const symbol = rawSymbol.trim().toUpperCase();
  if (!validSymbol(symbol) || !validDate(date) || date !== kstDate(now)) {
    throw new MarketError("오늘 한국 시간 기준일과 유효한 종목 코드가 필요합니다.", 400);
  }
  if (fxPair(symbol)) return fetchFxBaseline(symbol, date, signal);
  const baselineAt = Date.parse(`${date}T00:00:00+09:00`);
  const plan = midnightPricePlan(symbol, baselineAt);
  try {
    return await providerRequests.request(
      JSON.stringify(["midnight-baseline-v2", symbol, date]),
      async (providerSignal) => {
        if (plan.kind === "unknown-session") {
          throw new BaselineUnavailable(emptyBaseline(symbol, date, new Date().toISOString(), "unknown-session"));
        }
        const result = await yahoo.chart(
          symbol,
          {
            period1: new Date(plan.kind === "minute" ? baselineAt - FX_LOOKBACK_MINUTES * MINUTE : plan.dayStart),
            period2: new Date(baselineAt),
            interval: plan.kind === "minute" ? "1m" : "1d",
            includePrePost: false,
          },
          { fetchOptions: { signal: providerSignal } },
        );
        if (result.meta?.symbol?.toUpperCase() !== symbol) {
          throw new MarketError("요청한 종목과 기준 가격의 종목이 일치하지 않습니다.", 502);
        }
        const baseline = selectMidnightPrice(symbol, date, result, new Date().toISOString(), plan);
        if (baseline.status === "unavailable") throw new BaselineUnavailable(baseline);
        return baseline;
      },
      { signal, ttlMs: 300_000, timeoutMs: 20_000 },
    );
  } catch (error) {
    if (error instanceof BaselineUnavailable) return error.baseline;
    throw error;
  }
}
