import { normalizeCurrency } from "@/lib/currency";
import { addCalendarDays } from "@/lib/performance";
import { createHoldingAccumulator, deriveHoldings } from "@/lib/portfolio";
import type { Transaction } from "@/lib/types";
type HistoryRequest =
  | { type: "price"; key: string; symbol: string }
  | { type: "fx"; key: string; symbol: string; start: string; end: string };
/** Only positions carried into the interval and trades inside it need market history. */
export function planHistoryRequests(
  transactions: Transaction[],
  next: string,
  today: string,
  fxEnd = today,
) {
  const held = new Set(
    deriveHoldings(transactions.filter((tx) => tx.date < next)).map(
      (h) => h.symbol,
    ),
  );
  const relevant = transactions.filter(
    (tx) => held.has(tx.symbol) || (tx.date >= next && tx.date <= today),
  );
  const symbols = closingSymbols(transactions, next, today);
  const fallbackStart = addCalendarDays(
    relevant.reduce((date, tx) => (tx.date < date ? tx.date : date), next),
    -7,
  );
  return {
    fallbackStart,
    requests: [
      ...symbols.map((key) => ({ key, symbol: key, type: "price" })),
      ...activeFxRanges(transactions, next, fxEnd),
    ] as HistoryRequest[],
  };
}

/** A same-day completed round trip needs its fills, not an unused closing quote. */
function closingSymbols(transactions: Transaction[], start: string, end: string) {
  const ordered = transactions.filter(tx => tx.date <= end).sort((a, b) =>
    a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const boundaries = [...new Set([start, ...ordered.filter(tx => tx.date >= start).map(tx => tx.date)])].sort();
  const positions = createHoldingAccumulator();
  const symbols = new Set<string>();
  let cursor = 0;
  for (const date of boundaries) {
    while (cursor < ordered.length && ordered[cursor].date <= date) positions.apply(ordered[cursor++]);
    for (const holding of positions.holdings()) symbols.add(holding.symbol);
  }
  return [...symbols];
}

/** End-of-day valuations need FX only while a position in that currency remains open. */
function activeFxRanges(transactions: Transaction[], start: string, end: string): HistoryRequest[] {
  if (start > end) return [];
  const ordered = transactions.filter(tx => tx.date <= end).sort((a, b) =>
    a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const boundaries = [...new Set([start, ...ordered.filter(tx => tx.date >= start).map(tx => tx.date)])].sort();
  const positions = createHoldingAccumulator();
  const ranges = new Map<string, { start: string; end: string }[]>();
  let cursor = 0;
  for (let index = 0; index < boundaries.length; index++) {
    const date = boundaries[index];
    while (cursor < ordered.length && ordered[cursor].date <= date) positions.apply(ordered[cursor++]);
    const until = index + 1 < boundaries.length ? addCalendarDays(boundaries[index + 1], -1) : end;
    const currencies = new Set(positions.holdings().map(holding => normalizeCurrency(holding.currency ?? "USD")));
    for (const currency of currencies) {
      if (currency === "KRW") continue;
      const intervals = ranges.get(currency) ?? [];
      const previous = intervals.at(-1);
      if (previous && addCalendarDays(previous.end, 1) === date) previous.end = until;
      else intervals.push({ start: date, end: until });
      ranges.set(currency, intervals);
    }
  }
  return [...ranges].flatMap(([key, intervals]) => intervals.map(interval =>
    ({ type: "fx", key, symbol: `${key}KRW=X`, ...interval })));
}
