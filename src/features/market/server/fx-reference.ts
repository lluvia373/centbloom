import type { MidnightBaseline } from "../baseline";
import { fxPair } from "../fx";
import { addDays, localInstant } from "../schedule/time";
import { MarketError, providerRequests, validDate } from "./provider";
import { fetchEcbReleases } from "./fx-reference-release";

export const ECB_REFERENCE_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml";
export function parseEcbReferences(xml: string) {
  if (!xml.includes("http://www.ecb.int/vocabulary/2002-08-01/eurofxref")) throw new MarketError("참고 환율 형식을 확인하지 못했습니다.");
  const days: { date: string; rates: Record<string, number> }[] = [];
  for (const day of xml.matchAll(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]\s*>([\s\S]*?)<\/Cube>/g)) {
    if (!validDate(day[1])) continue;
    const rates: Record<string, number> = { EUR: 1 };
    for (const rate of day[2].matchAll(/<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([0-9.]+)['"]\s*\/>/g)) {
      const value = Number(rate[2]);
      if (Number.isFinite(value) && value > 0) rates[rate[1]] = value;
    }
    if (rates.USD && rates.KRW) days.push({ date: day[1], rates });
  }
  if (!days.length) throw new MarketError("참고 환율이 비어 있습니다.");
  return days.sort((a, b) => b.date.localeCompare(a.date));
}

export function selectEcbBaseline(symbol: string, date: string, days: { date: string; rates: Record<string, number>; publishedAt?: string }[]): MidnightBaseline | null {
  const pair = fxPair(symbol);
  if (!pair) return null;
  const at = Date.parse(`${date}T00:00:00+09:00`);
  for (const day of days) {
    if (!validDate(day.date)) continue;
    // MID records when the release actually became public. The history-only path has no
    // publication timestamp, so it retains the conservative whole-European-day boundary.
    // Neither bound is an observed market-price timestamp.
    const knownBy = day.publishedAt ? Date.parse(day.publishedAt) : localInstant(addDays(day.date, 1), 0, "Europe/Berlin");
    const age = at - localInstant(day.date, 0, "Europe/Berlin");
    if (!Number.isFinite(knownBy) || knownBy > at || day.date >= date || age < 0 || age > 7 * 86400000 || !day.rates[pair.base] || !day.rates[pair.quote]) continue;
    const price = day.rates[pair.quote] / day.rates[pair.base];
    if (!Number.isFinite(price) || price <= 0) continue;
    return { symbol, date, baselineAt: new Date(at).toISOString(), currency: pair.quote, price,
      status: "available", precision: "daily-reference", source: "ecb-reference",
      sourceAt: null, sourceEndAt: null,
      cutoffLagSeconds: null, marketClosed: null, fetchedAt: new Date().toISOString(),
      fx: { method: "ecb-reference", referenceDate: day.date, ...(day.publishedAt ? { publishedAt: day.publishedAt } : {}), components: [pair.base, pair.quote].map(currency => ({
        symbol: `EUR/${currency}`, price: day.rates[currency], sourceAt: day.date,
      })) } };
  }
  return null;
}

export async function fetchEcbBaseline(symbol: string, date: string, signal?: AbortSignal) {
  try {
    const releases = await fetchEcbReleases(Date.parse(`${date}T00:00:00+09:00`), signal);
    const released = selectEcbBaseline(symbol, date, releases);
    if (released) return released;
  } catch { signal?.throwIfAborted(); }
  const days = await providerRequests.request("ecb-reference-90d", async (s) => {
    const response = await fetch(ECB_REFERENCE_URL, { signal: s, cache: "no-store" });
    if (!response.ok) throw new MarketError("공식 참고 환율 조회에 실패했습니다.");
    return parseEcbReferences(await response.text());
  }, { signal, ttlMs: 60 * 60_000, timeoutMs: 10_000 });
  return selectEcbBaseline(symbol, date, days);
}
