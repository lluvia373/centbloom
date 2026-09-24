import type { StockQuote } from "@/lib/types";

export type PriceDirection = "below" | "above";
export interface PriceAlertInput { direction: PriceDirection; threshold: number; currency: string; enabled: boolean }
export interface PriceAlert extends PriceAlertInput {
  symbol: string;
  matched: boolean | null;
  last_price: number | null;
  last_quoted_at: string | null;
}
export interface PriceObservation {
  symbol: string; price: number; currency: string; quotedAt: string; fetchedAt: string; sourceUrl: string;
}
/** Same strict age bounds are checked again in SQL; retrieval time is not quote time. */
export function priceObservation(quote: StockQuote | undefined, failed: boolean, now = Date.now()): PriceObservation | null {
  if (!quote || failed || !Number.isFinite(quote.price) || quote.price <= 0) return null;
  const quoted = Date.parse(quote.quotedAt ?? ""), fetched = Date.parse(quote.fetchedAt ?? "");
  if (!Number.isFinite(quoted) || !Number.isFinite(fetched) || quoted > now || fetched > now ||
    now - quoted > 20 * 60_000 || now - fetched > 2 * 60_000) return null;
  return { symbol: quote.symbol, price: quote.price, currency: quote.currency,
    quotedAt: quote.quotedAt!, fetchedAt: quote.fetchedAt!,
    sourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(quote.symbol)}/` };
}
export function conditionReached(rule: PriceAlertInput, quote: StockQuote | undefined, failed: boolean, now = Date.now()): boolean | null {
  const observation = priceObservation(quote, failed, now);
  if (!observation || observation.currency !== rule.currency) return null;
  return rule.direction === "below" ? observation.price <= rule.threshold : observation.price >= rule.threshold;
}
