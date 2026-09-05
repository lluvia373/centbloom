"use client";
import { todayISO } from "@/lib/format";
import { getFxRateToKRW, getQuote } from "@/lib/stock-api";
import type { StockQuote } from "@/lib/types";
import { useEffect, useState } from "react";
export function useTradeMarket(
  symbol: string | undefined,
  date: string,
  retry: number,
) {
  const [state, setState] = useState<{
    symbol?: string;
    date: string;
    quote?: StockQuote;
    fx: number;
    usdKrw: number;
    error: string | null;
  }>({ date: "", fx: 0, usdKrw: 0, error: null });
  useEffect(() => {
    if (!symbol) return;
    const controller = new AbortController();
    const fxDate = date === todayISO() ? undefined : date;
    const usd = getFxRateToKRW("USD", fxDate, controller.signal);
    const quote = getQuote(symbol, controller.signal);
    const fx = quote.then((q) =>
      q.currency === "USD"
        ? usd
        : getFxRateToKRW(q.currency, fxDate, controller.signal),
    );
    void Promise.all([quote, fx, usd])
      .then(([quote, fx, usdKrw]) => {
        if (!controller.signal.aborted)
          setState({ symbol, date, quote, fx, usdKrw, error: null });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({
            symbol,
            date,
            fx: 0,
            usdKrw: 0,
            error:
              error instanceof Error
                ? error.message
                : "거래 통화 또는 환율을 불러올 수 없습니다.",
          });
      });
    return () => controller.abort();
  }, [symbol, date, retry]);
  const current = state.symbol === symbol && state.date === date;
  return {
    market: current && state.quote ? { ...state, quote: state.quote } : null,
    marketLoading: !!symbol && !current,
    marketError: current ? state.error : null,
  };
}
