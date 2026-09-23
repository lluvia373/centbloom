import type { MidnightBaseline } from "../baseline";
import { FX_MINUTE, FX_LOOKBACK, fxCutoff, fxPair, sameFxPair, usdLeg, usableFxQuote, usableValuationFxQuote, type FxEvidence } from "../fx";
import type { StockQuote } from "@/lib/types";
import { MarketError, providerRequests, yahoo } from "./provider";

type Sample = { at: number; price: number };
type FxSample = Sample & { closed: boolean | null; fx: FxEvidence };
const positive = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
async function optional<T>(load: () => Promise<T>, signal?: AbortSignal) {
  try { return await load(); } catch { signal?.throwIfAborted(); return null; }
}

function minutes(symbol: string, cutoff: number, since: number, signal?: AbortSignal) {
  return providerRequests.request(`fx-minute:${symbol}:${since}:${cutoff}`, async (s) => {
    const result = await yahoo.chart(symbol, {
      period1: new Date(since), period2: new Date(cutoff), interval: "1m", includePrePost: false,
    }, { fetchOptions: { signal: s } });
    if (!sameFxPair(symbol, result.meta.symbol) || result.meta.currency !== fxPair(symbol)?.quote ||
      result.meta.instrumentType !== "CURRENCY" || result.meta.dataGranularity !== "1m")
      throw new MarketError("환율 자료의 통화·시간 단위를 확인하지 못했습니다.");
    const rows: Sample[] = result.quotes.filter(q => positive(q.close) && Number.isFinite(q.date?.getTime()))
      .map(q => ({ at: q.date.getTime(), price: q.close! }))
      .filter(q => q.at % FX_MINUTE === 0 && q.at >= since && q.at + FX_MINUTE <= cutoff)
      .sort((a, b) => b.at - a.at);
    if (!rows.length) throw new MarketError("기준 시각의 환율 자료가 없습니다.", 404);
    return rows;
  }, { signal, ttlMs: 60_000, timeoutMs: 8_000 });
}

function directSample(symbol: string, rows: Sample[] | null, closed: boolean | null): FxSample | null {
  return rows ? { ...rows[0], closed, fx: { method: "direct", components: [
    { symbol, price: rows[0].price, sourceAt: new Date(rows[0].at).toISOString() },
  ] } } : null;
}

async function crossSample(symbol: string, cutoff: number, since: number, closed: boolean | null, signal?: AbortSignal): Promise<FxSample | null> {
  const pair = fxPair(symbol)!;
  // A USD pair already is a single leg; its alias is not an independent source.
  if (pair.base === "USD" || pair.quote === "USD") return null;
  const base = usdLeg(pair.base), quote = usdLeg(pair.quote);
  const [left, right] = await Promise.all([
    optional(() => minutes(base.symbol, cutoff, since, signal), signal),
    optional(() => minutes(quote.symbol, cutoff, since, signal), signal),
  ]);
  if (!left || !right) return null;
  const byTime = new Map(right.map(row => [row.at, row]));
  for (const a of left) {
    const b = byTime.get(a.at);
    if (!b) continue; // Never combine different minutes, including during a long closure.
    const price = (quote.inverted ? 1 / b.price : b.price) / (base.inverted ? 1 / a.price : a.price);
    if (positive(price)) return { at: a.at, price, closed, fx: { method: "usd-cross", components: [
      { symbol: base.symbol, price: a.price, sourceAt: new Date(a.at).toISOString() },
      { symbol: quote.symbol, price: b.price, sourceAt: new Date(b.at).toISOString() },
    ] } };
  }
  return null;
}

/** No outer provider queue: each leaf request owns its slot, so cross requests cannot deadlock. */
export async function fetchFxMinute(symbol: string, asOf: number, signal?: AbortSignal): Promise<FxSample | null> {
  const pair = fxPair(symbol);
  if (!pair || pair.base === pair.quote) return null;
  const cutoff = fxCutoff(asOf);
  const since = cutoff.at - 5 * FX_MINUTE;
  const direct = directSample(symbol, await optional(() => minutes(symbol, cutoff.at, since, signal), signal), cutoff.closed);
  if (direct) return direct;
  const cross = await crossSample(symbol, cutoff.at, since, cutoff.closed, signal);
  if (cross) return cross;
  // Find the last observed complete minute, not a guessed Friday close.
  // Missing data does not prove a holiday: leave marketClosed unknown.
  const lookback = Math.ceil((asOf - FX_LOOKBACK) / FX_MINUTE) * FX_MINUTE;
  const [olderDirect, olderCross] = await Promise.all([
    optional(() => minutes(symbol, cutoff.at, lookback, signal), signal).then(rows => directSample(symbol, rows, null)),
    crossSample(symbol, cutoff.at, lookback, null, signal),
  ]);
  const last = [olderDirect, olderCross].filter((item): item is FxSample => item !== null).sort((a, b) => b.at - a.at)[0];
  return last ? { ...last, fx: { ...last.fx, carried: true } } : null;
}

export async function fetchFxBaseline(symbol: string, date: string, signal?: AbortSignal): Promise<MidnightBaseline> {
  const baselineAt = new Date(`${date}T00:00:00+09:00`).toISOString();
  const sample = await fetchFxMinute(symbol, Date.parse(baselineAt), signal);
  const common = { symbol, date, baselineAt, currency: fxPair(symbol)!.quote, fetchedAt: new Date().toISOString() };
  if (sample) return { ...common, price: sample.price, status: "available", precision: "minute", source: "yahoo-chart",
    sourceAt: new Date(sample.at).toISOString(), sourceEndAt: new Date(sample.at + FX_MINUTE).toISOString(),
    cutoffLagSeconds: (Date.parse(baselineAt) - sample.at - FX_MINUTE) / 1000, marketClosed: sample.closed, fx: sample.fx };
  // A separately dated reference is never described as a midnight trade.
  const { fetchEcbBaseline } = await import("./fx-reference");
  const reference = await optional(() => fetchEcbBaseline(symbol, date, signal), signal);
  if (reference) return reference;
  return { ...common, price: null, status: "unavailable", precision: null, source: "yahoo-chart", sourceAt: null,
    sourceEndAt: null, cutoffLagSeconds: null, marketClosed: null, reason: "missing-price" };
}

export async function fetchFxQuote(symbol: string, signal?: AbortSignal, now = Date.now()): Promise<StockQuote> {
  const cutoff = fxCutoff(now);
  const response = await optional(() => providerRequests.request(`fx-quote:${symbol}`, async (s) => {
    const q = await yahoo.quote(symbol, { fields: ["symbol", "currency", "regularMarketPrice", "regularMarketTime", "regularMarketChange", "regularMarketChangePercent", "marketState"] }, { fetchOptions: { signal: s } });
    const at = q?.regularMarketTime?.getTime();
    if (!q || !sameFxPair(symbol, q.symbol) || q.currency !== fxPair(symbol)?.quote ||
      at == null || !usableValuationFxQuote(at, now))
      throw new MarketError("현재 환율의 통화·기준 시각을 확인하지 못했습니다.");
    const closed = q.marketState === "CLOSED";
    // Valid pair/time metadata can report a special closure even if its price is missing.
    if (!positive(q.regularMarketPrice)) {
      if (closed) return { quote: null, closed };
      throw new MarketError("현재 환율 가격을 확인하지 못했습니다.");
    }
    const quote: StockQuote = { symbol, name: symbol, price: q.regularMarketPrice, currency: q.currency!,
      change: q.regularMarketChange ?? 0, changePercent: q.regularMarketChangePercent ?? 0,
      quotedAt: new Date(at).toISOString(), fetchedAt: new Date(now).toISOString(),
      marketState: cutoff.closed || closed ? "CLOSED" : "REGULAR", source: "yahoo-quote",
      ...(at < cutoff.at - 15 * FX_MINUTE ? { fx: { method: "direct" as const, carried: true,
        components: [{ symbol, price: q.regularMarketPrice, sourceAt: new Date(at).toISOString() }] } } : {}) };
    return { quote, closed };
  }, { signal, ttlMs: 5_000, timeoutMs: 8_000 }), signal);
  const candidate = response?.quote;
  const direct = candidate && usableValuationFxQuote(Date.parse(candidate.quotedAt!), now) ? candidate : null;
  const directCurrent = direct && usableFxQuote(Date.parse(direct.quotedAt!), now, direct.marketState);
  const directResult: StockQuote | null = direct && !directCurrent ? { ...direct, fx: {
    method: "direct", ...direct.fx, carried: true, valuationOnly: true,
    components: direct.fx?.components ?? [{ symbol, price: direct.price, sourceAt: direct.quotedAt! }],
  } } : direct;
  if (direct && directCurrent && !direct.fx?.carried) return direct;
  const sample = await fetchFxMinute(symbol, now, signal);
  const marketState = cutoff.closed || response?.closed ? "CLOSED" : "REGULAR";
  const sampleCurrent = sample && usableFxQuote(sample.at + FX_MINUTE, now, marketState);
  // A stale quote can lag behind the chart. Prefer the later observation; keep
  // the original decimal quote when both belong to the same completed minute.
  // Prefer an eligible current observation, then the latest confirmed source.
  if (directResult && (!sample || ((directCurrent || !sampleCurrent) && sample.at <= Date.parse(directResult.quotedAt!))))
    return directResult;
  if (!sample || !usableValuationFxQuote(sample.at + FX_MINUTE, now))
    throw new MarketError("현재 환율을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.", 503);
  return { symbol, name: symbol, price: sample.price, currency: fxPair(symbol)!.quote, change: 0, changePercent: 0,
    quotedAt: new Date(sample.at + FX_MINUTE).toISOString(), fetchedAt: new Date(now).toISOString(),
    marketState, source: sample.fx.method === "usd-cross" ? "yahoo-usd-cross" : "yahoo-chart",
    fx: { ...sample.fx, ...(!sampleCurrent ? { carried: true, valuationOnly: true as const } : {}) } };
}
