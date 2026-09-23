import type { StockQuote } from "@/lib/types";
import { fxPair } from "../fx";
import { MarketError, validSymbol } from "./provider";
import { readPreparedQuotes } from "./prepared-runtime";
import { quoteBatchSymbols } from "./quote-source";

export { quoteBatchSymbols } from "./quote-source";
export type { QuoteBatch } from "./quote-source";

export function fetchQuotes(symbols: string[], signal?: AbortSignal) {
  return readPreparedQuotes(quoteBatchSymbols(symbols.join(",")), signal);
}

export async function fetchQuote(symbol: string, signal?: AbortSignal): Promise<StockQuote> {
  symbol = symbol.trim().toUpperCase();
  if (!validSymbol(symbol) || (symbol.endsWith("=X") && !fxPair(symbol)))
    throw new MarketError("조회할 종목을 확인해 주세요.", 400);
  const result = await readPreparedQuotes([symbol], signal);
  if (result.quotes[symbol]) return result.quotes[symbol];
  const error = result.errors[symbol];
  throw new MarketError(error?.message ?? "현재 시세를 확인하지 못했습니다.", error?.status ?? 502);
}
