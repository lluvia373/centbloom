import { validateTransactionHistory } from "@/lib/portfolio";
import type { Transaction } from "@/lib/types";

/** Verified corporate-action input, NOT the incomplete dividend rows in ChartSeries. */
export interface DividendAnnouncement {
  id: string;
  symbol: string;
  currency: string;
  exDate: string;
  paymentDate: string | null;
  amountPerShare: number | null;
  marketTimeZone: string;
  sourceUrl: string;
  status: "declared" | "cancelled";
  entitlement: "ordinary-cash" | "unsupported";
  /** A source adapter must reconcile splits/adjusted amounts before asserting this. */
  shareBasis: "transaction-compatible" | "unverified";
  /** Optional, externally verified rule for this event and the user's tax situation. */
  withholding: { rate: number; sourceUrl: string } | null;
}

type UnavailableReason = "announcement" | "entitlement" | "share-basis" | "history";
export type DividendEstimate = {
  eventId: string;
  symbol: string;
  currency: string;
  exDate: string;
  paymentDate: string | null;
  sourceUrl: string;
} & (
  | { status: "unavailable"; reason: UnavailableReason }
  | { status: "cancelled" }
  | {
    status: "estimated" | "not-eligible";
    quantity: number;
    /** Approved date-only approximation, not proof of brokerage entitlement. */
    quantityBasis: "recorded-dates" | "kst-day-end-estimate";
    grossAmount: number;
    estimatedNetAmount: number | null;
    taxSourceUrl: string | null;
    /** A future ex-date remains conditional on subsequent trades. */
    eligibility: "recorded-history" | "current-holding-projection";
    /** This is never proof of receipt in a brokerage account. */
    paymentState: "scheduled" | "date-passed" | "date-unknown";
  }
);

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
}

function sourceLink(value: string): boolean {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

function marketDate(format: Intl.DateTimeFormat, instant: number): string {
  const parts = format.formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Pure calculation: accepts ONE account's ledger; never writes income, cash or trades. */
export function estimateDividend(
  transactions: readonly Transaction[],
  event: DividendAnnouncement,
  options: { asOfDate: string; portfolioId: string | "all" },
): DividendEstimate {
  if (!validDate(options.asOfDate)) throw new Error("Invalid dividend calculation date");
  const base = {
    eventId: event.id, symbol: event.symbol, currency: event.currency,
    exDate: event.exDate, paymentDate: event.paymentDate, sourceUrl: event.sourceUrl,
  };
  const unavailable = (reason: UnavailableReason): DividendEstimate => ({ ...base, status: "unavailable", reason });
  if (!event.id || !event.symbol || !event.marketTimeZone || !/^[A-Z]{3}$/.test(event.currency) || !sourceLink(event.sourceUrl) ||
      !validDate(event.exDate) || (event.paymentDate !== null && !validDate(event.paymentDate))) return unavailable("announcement");
  if (event.status === "cancelled") return { ...base, status: "cancelled" };
  if (event.status !== "declared" || event.amountPerShare === null ||
      !Number.isFinite(event.amountPerShare) || event.amountPerShare < 0) return unavailable("announcement");
  if (event.entitlement !== "ordinary-cash" || (event.paymentDate !== null && event.paymentDate < event.exDate))
    return unavailable("entitlement");
  if (event.shareBasis !== "transaction-compatible") return unavailable("share-basis");

  let format: Intl.DateTimeFormat;
  try { format = new Intl.DateTimeFormat("en-US", { timeZone: event.marketTimeZone, year: "numeric", month: "2-digit", day: "2-digit" }); }
  catch { return unavailable("announcement"); }

  const records = transactions.filter(tx => tx.symbol === event.symbol &&
    (options.portfolioId === "all" || tx.portfolioId === options.portfolioId));
  const ids = new Set<string>();
  for (const tx of records) {
    if (!tx.id || ids.has(tx.id) || !tx.portfolioId || !validDate(tx.date) ||
        (tx.type !== "buy" && tx.type !== "sell")) return unavailable("history");
    ids.add(tx.id);
  }
  const observed = records.filter(tx => tx.date <= options.asOfDate)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  if (validateTransactionHistory(observed)) return unavailable("history");

  let quantity = 0;
  let quantityCompensation = 0;
  let dateApproximation = false;
  for (const tx of observed) {
    // Approved approximation: include the entire KST day if it overlaps the
    // eligible market date. Both buys and sells count; no execution time is invented.
    const start = Date.parse(`${tx.date}T00:00:00+09:00`);
    const first = marketDate(format, start);
    const last = marketDate(format, start + 86_400_000 - 1);
    if (first >= event.exDate) continue;
    if (last >= event.exDate) dateApproximation = true;
    const before = quantity;
    // Compensated summation keeps 1,000 × 0.01 shares equivalent to one 10-share
    // trade, including cent rounding of the estimated payout.
    const change = (tx.type === "buy" ? tx.quantity : -tx.quantity) - quantityCompensation;
    const next = quantity + change;
    quantityCompensation = (next - quantity) - change;
    quantity = next;
    if (tx.type === "sell" && Math.abs(quantity) <= Number.EPSILON * Math.max(Math.abs(before), tx.quantity) * 4) {
      quantity = 0;
      quantityCompensation = 0;
    }
  }
  // Remove only machine precision dust; legitimately tiny fractional holdings remain.
  if (!Number.isFinite(quantity) || quantity < -1e-8) return unavailable("history");
  quantity = Math.max(0, quantity);
  const grossAmount = quantity * event.amountPerShare;
  if (!Number.isFinite(grossAmount)) return unavailable("announcement");
  const tax = event.withholding;
  const taxKnown = tax !== null && Number.isFinite(tax.rate) && tax.rate >= 0 && tax.rate <= 1 && sourceLink(tax.sourceUrl);
  const marketToday = marketDate(format, Date.parse(`${options.asOfDate}T23:59:59+09:00`));
  return {
    ...base, status: quantity === 0 ? "not-eligible" : "estimated", quantity, grossAmount,
    quantityBasis: dateApproximation ? "kst-day-end-estimate" : "recorded-dates",
    estimatedNetAmount: taxKnown ? grossAmount * (1 - tax.rate) : null,
    taxSourceUrl: taxKnown ? tax.sourceUrl : null,
    eligibility: event.exDate > marketToday ? "current-holding-projection" : "recorded-history",
    paymentState: event.paymentDate === null ? "date-unknown" : event.paymentDate > marketToday ? "scheduled" : "date-passed",
  };
}
