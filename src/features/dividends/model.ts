import type { Transaction } from "@/lib/types";
import { estimateDividend } from "@/features/portfolio/model/dividends";
import { dividendWithholding } from "./tax";
import type { DividendFeed } from "./types";

function compatibleShareHistory(ledger: readonly Transaction[], from: string, asOfDate: string): boolean {
  const balances = new Map<Transaction["portfolioId"], { value: number; correction: number; scale: number }>();
  for (const tx of ledger) {
    if (tx.date >= from || tx.date > asOfDate) continue;
    const sum = balances.get(tx.portfolioId) ?? { value: 0, correction: 0, scale: 0 };
    const change = (tx.type === "buy" ? tx.quantity : -tx.quantity) - sum.correction;
    const next = sum.value + change;
    sum.correction = (next - sum.value) - change;
    sum.value = next; sum.scale = Math.max(sum.scale, tx.quantity);
    balances.set(tx.portfolioId, sum);
  }
  // A fully closed pre-split position does not contaminate later purchases.
  // Never cancel balances between different portfolios. Full ledger validation remains below.
  return [...balances.values()].every(sum => Math.abs(sum.value) <= Number.EPSILON * sum.scale * 4);
}

export function dividendSchedule(transactions: readonly Transaction[], feed: DividendFeed, asOfDate: string, portfolioId: string) {
  const scoped = transactions.filter(tx => portfolioId === "all" || tx.portfolioId === portfolioId);
  const bySymbol = new Map<string, Transaction[]>();
  for (const tx of scoped) {
    const list = bySymbol.get(tx.symbol) ?? [];
    list.push(tx); bySymbol.set(tx.symbol, list);
  }
  const coverage = new Map(feed.symbols.map(item => [item.symbol, item]));
  const missingSymbols = [...bySymbol.keys()].filter(symbol => {
    const item = coverage.get(symbol);
    return !item || item.status === "unsupported" || item.status === "failed";
  });
  const noAnnouncements = [...bySymbol.keys()].filter(symbol => coverage.get(symbol)?.status === "no-announcement");
  const partialSymbols = [...bySymbol.keys()].filter(symbol => coverage.get(symbol)?.status === "partial");
  const seen = new Set<string>();
  const rows = feed.events.flatMap(event => {
    if (event.declaredDate > asOfDate) return [];
    // Failed refresh may mean an unprocessed cancellation, not merely a slow request.
    // Preserve prior source facts on disk, but never present them as a new valid estimate.
    if (!["supported", "partial"].includes(coverage.get(event.symbol)?.status ?? "")) return [];
    const ledger = bySymbol.get(event.symbol);
    if (!ledger?.length) return [];
    if (seen.has(event.id)) throw Error("Duplicate prepared dividend");
    seen.add(event.id);
    const compatible = compatibleShareHistory(ledger, event.shareHistoryFrom, asOfDate);
    const withholding = event.withholding ?? dividendWithholding({ residence: "KR", account: "general", issuerCountry: event.issuerCountry,
      instrument: event.instrument === "ordinary-share" ? "ordinary-share" : "other",
      distribution: event.entitlement === "ordinary-cash" ? "ordinary-cash" : "other", treatyEligible: event.treatyEligible });
    const estimate = estimateDividend(ledger, {
      ...event, withholding, shareBasis: compatible ? event.shareBasis : "unverified",
    }, { asOfDate, portfolioId });
    if (estimate.status === "not-eligible") return [];
    return [{ event, estimate, rate: withholding?.rate ?? null }];
  }).sort((a, b) => {
    if (a.event.paymentDate === null || b.event.paymentDate === null) {
      if (a.event.paymentDate !== b.event.paymentDate) return a.event.paymentDate === null ? 1 : -1;
      return b.event.recordDate.localeCompare(a.event.recordDate) || a.event.symbol.localeCompare(b.event.symbol);
    }
    const aFuture = a.event.paymentDate >= asOfDate, bFuture = b.event.paymentDate >= asOfDate;
    if (aFuture !== bFuture) return aFuture ? -1 : 1;
    return (aFuture ? a.event.paymentDate.localeCompare(b.event.paymentDate) : b.event.paymentDate.localeCompare(a.event.paymentDate)) || a.event.symbol.localeCompare(b.event.symbol);
  });
  // No portfolio/account totals are cached or sent to the collector. Missing events
  // and currencies are never silently collapsed into an apparent total.
  const selectedCoverage = [...bySymbol.keys()].flatMap(symbol => coverage.get(symbol) ?? []);
  const checkedAt = selectedCoverage.flatMap(item => item.checkedAt ? [item.checkedAt] : []).sort()[0] ?? feed.sourceCheckedAt;
  return { rows, missingSymbols, noAnnouncements, partialSymbols, partial: missingSymbols.length > 0 || partialSymbols.length > 0, checkedAt,
    hasTransactions: scoped.length > 0,
    from: selectedCoverage.map(item => item.from).sort().at(-1) ?? null,
    through: selectedCoverage.map(item => item.through).sort()[0] ?? null };
}
