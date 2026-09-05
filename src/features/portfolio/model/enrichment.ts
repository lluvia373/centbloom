import { todayISO } from "@/lib/format";
import { getFxRateToKRW, getQuote } from "@/lib/stock-api";
import type { Transaction } from "@/lib/types";
import { mapLimited } from "@/shared/async/pool";
import type { TransactionCommand } from "./types";

export async function prepareTransactions(
  records: Transaction[],
  command: TransactionCommand,
  previous: Transaction[],
): Promise<Transaction[]> {
  const before = new Map(previous.map((tx) => [tx.id, tx]));
  return mapLimited(records, 6, async (tx) => {
    const dateChanged =
      command.type === "update" &&
      command.id === tx.id &&
      before.get(tx.id)?.date !== tx.date;
    if (
      !dateChanged &&
      tx.currency &&
      tx.fxRateToKRW != null &&
      tx.usdKrwRateAtTransaction != null
    )
      return tx;
    const date = tx.date === todayISO() ? undefined : tx.date;
    const usd =
      !dateChanged && tx.usdKrwRateAtTransaction != null
        ? Promise.resolve(tx.usdKrwRateAtTransaction)
        : getFxRateToKRW("USD", date);
    const currency = Promise.resolve(
      tx.currency ?? getQuote(tx.symbol).then((quote) => quote.currency),
    );
    const native = currency.then((value) =>
      !dateChanged && tx.fxRateToKRW != null
        ? tx.fxRateToKRW
        : value === "USD"
          ? usd
          : getFxRateToKRW(value, date),
    );
    const [resolvedCurrency, fxRateToKRW, usdKrwRateAtTransaction] =
      await Promise.all([currency, native, usd]);
    return {
      ...tx,
      currency: resolvedCurrency,
      fxRateToKRW,
      usdKrwRateAtTransaction,
    };
  });
}
