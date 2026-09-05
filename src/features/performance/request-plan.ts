import { normalizeCurrency } from "@/lib/currency";
import { addCalendarDays } from "@/lib/performance";
import { deriveHoldings } from "@/lib/portfolio";
import type { Transaction } from "@/lib/types";
/** Only positions carried into the interval and trades inside it need market history. */
export function planHistoryRequests(
  transactions: Transaction[],
  next: string,
  today: string,
) {
  const held = new Set(
    deriveHoldings(transactions.filter((tx) => tx.date < next)).map(
      (h) => h.symbol,
    ),
  );
  const relevant = transactions.filter(
    (tx) => held.has(tx.symbol) || (tx.date >= next && tx.date <= today),
  );
  const symbols = [...new Set(relevant.map((tx) => tx.symbol))];
  const currencies = [
    ...new Set(relevant.map((tx) => normalizeCurrency(tx.currency ?? "USD"))),
  ].filter((c) => c !== "KRW");
  const fallbackStart = addCalendarDays(
    relevant.reduce((date, tx) => (tx.date < date ? tx.date : date), next),
    -7,
  );
  return {
    fallbackStart,
    requests: [
      ...symbols.map((key) => ({ key, symbol: key, type: "price" })),
      ...currencies.map((key) => ({ key, symbol: `${key}KRW=X`, type: "fx" })),
    ],
  };
}
