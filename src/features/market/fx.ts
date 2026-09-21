import { addDays, localInstant, localParts } from "./schedule/time";

export const FX_MINUTE = 60_000;
export const FX_LOOKBACK = 7 * 24 * 60 * FX_MINUTE;
export function fxPair(symbol: string) {
  const match = /^(?:([A-Z]{3}))?([A-Z]{3})=X$/.exec(symbol.toUpperCase());
  return match ? { base: match[1] ?? "USD", quote: match[2] } : null;
}
export function sameFxPair(requested: string, returned: string) {
  const a = fxPair(requested), b = fxPair(returned);
  return !!a && !!b && a.base === b.base && a.quote === b.quote;
}

/** Normal global FX week, not a claim that a particular dealer traded at the close. */
export function fxCutoff(at: number) {
  const zone = "America/New_York";
  const local = localParts(at, zone);
  const day = new Date(local.date + "T00:00:00Z").getUTCDay();
  const closed = day === 6 || (day === 5 && local.minute >= 17 * 60) || (day === 0 && local.minute < 17 * 60);
  const friday = addDays(local.date, day === 0 ? -2 : 5 - day);
  return { at: closed ? localInstant(friday, 17 * 60, zone) : Math.floor(at / FX_MINUTE) * FX_MINUTE, closed };
}

/** Provider convention: these four legs quote USD per unit; other legs quote units per USD. */
export function usdLeg(currency: string) {
  const inverted = ["EUR", "GBP", "AUD", "NZD"].includes(currency);
  return { symbol: inverted ? `${currency}USD=X` : `${currency}=X`, inverted };
}

/** A live market needs fresh data. During a closure, retain the last received observation. */
export function usableFxQuote(quotedAt: number, fetchedAt: number, marketState?: string) {
  if (!Number.isFinite(quotedAt) || !Number.isFinite(fetchedAt) || quotedAt > fetchedAt ||
    fetchedAt - quotedAt > FX_LOOKBACK) return false;
  const cutoff = fxCutoff(fetchedAt);
  if (cutoff.closed && quotedAt > cutoff.at) return false;
  return quotedAt >= cutoff.at - 15 * FX_MINUTE || cutoff.closed || marketState === "CLOSED";
}

export interface FxEvidence {
  method: "direct" | "usd-cross" | "ecb-reference";
  components: { symbol: string; price: number; sourceAt: string }[];
  referenceDate?: string;
  publishedAt?: string;
  /** Outside the normal close window; this is not proof of a holiday. */
  carried?: boolean;
}
