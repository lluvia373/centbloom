import { currencyUnitScale, normalizeCurrency } from "@/lib/currency";
import { deriveHoldings } from "@/lib/portfolio";
import type { DisplayCurrency, StockQuote, Transaction } from "@/lib/types";
import type { MidnightBaseline } from "@/features/market/baseline";

export interface PortfolioDailyChange {
  date: string;
  available: boolean;
  change: number;
  priceImpact: number;
  fxImpact: number;
  bySymbol: Record<string, number>;
  reason: string | null;
}

export function unavailableDailyChange(date: string, reason: string): PortfolioDailyChange {
  return { date, available: false, change: 0, priceImpact: 0, fxImpact: 0, bySymbol: {}, reason };
}

export function planDailyChange(transactions: Transaction[], date: string, displayCurrency: DisplayCurrency) {
  const recorded = transactions.filter((tx) => tx.date <= date);
  const opening = deriveHoldings(recorded.filter((tx) => tx.date < date));
  const closing = deriveHoldings(recorded);
  const trades = recorded.filter((tx) => tx.date === date);
  const symbols = [...new Set([...opening, ...closing, ...trades].map((item) => item.symbol))].sort();
  const currencies = [...new Set([...opening, ...closing, ...trades].map((item) => normalizeCurrency(item.currency)))];
  const fxSymbols = currencies.filter((currency) => currency !== "KRW" && currency !== displayCurrency)
    .map((currency) => `${currency}KRW=X`);
  if (displayCurrency === "USD" && currencies.some((currency) => currency !== "USD")) fxSymbols.push("USDKRW=X");
  return {
    opening, closing, trades, symbols,
    liveSymbols: [...new Set([...symbols, ...fxSymbols])].sort(),
    baselineSymbols: [...new Set([...opening.map((item) => item.symbol), ...fxSymbols])].sort(),
  };
}

/** Stocks/ETFs only: remove recorded net purchases, retain fees and realized intraday results. */
export function calculateDailyChange({ transactions, date, displayCurrency, quotes, baselines, failedSymbols = [] }: {
  transactions: Transaction[];
  date: string;
  displayCurrency: DisplayCurrency;
  quotes: Record<string, StockQuote>;
  baselines: Record<string, MidnightBaseline>;
  failedSymbols?: string[];
}): PortfolioDailyChange {
  const plan = planDailyChange(transactions, date, displayCurrency);
  const unavailable = (reason: string) => unavailableDailyChange(date, reason);
  if (!plan.symbols.length) return unavailable("보유종목 없음");
  const cutoff = Date.parse(`${date}T00:00:00+09:00`);
  const valid = (value: number | undefined | null): value is number => value != null && Number.isFinite(value) && value > 0;
  const baseline = (symbol: string) => {
    const item = baselines[symbol];
    return item?.date === date && Date.parse(item.baselineAt) === cutoff &&
      item.status === "available" && valid(item.price) && item.currency &&
      item.sourceEndAt && Date.parse(item.sourceEndAt) <= cutoff ? item : null;
  };
  const current = (symbol: string) => {
    const item = quotes[symbol];
    return !failedSymbols.includes(symbol) && item && valid(item.price) ? item : null;
  };
  const sameSessionClose = (quote: StockQuote, start: MidnightBaseline | null) => {
    if (!start || start.precision !== "session-close" || start.marketClosed !== true || quote.marketState !== "CLOSED") return false;
    const quotedAt = Date.parse(quote.quotedAt ?? "");
    const samePrice = quote.price === start.price ||
      (Math.fround(start.price!) === start.price && Math.fround(quote.price) === start.price);
    // Chart closes can be float32 while the quote returns the original decimal.
    // Only reconcile the same closed session; never round away intraday changes.
    return quotedAt >= Date.parse(start.sourceAt!) && quotedAt <= Date.parse(start.sourceEndAt!) &&
      Date.parse(quote.fetchedAt ?? "") >= cutoff && samePrice;
  };
  const currentFollowsBaseline = (quote: StockQuote, start: MidnightBaseline | null) => {
    const quotedAt = Date.parse(quote.quotedAt ?? "");
    if (!Number.isFinite(quotedAt)) return false;
    if (!start) return quotedAt >= cutoff;
    if (quotedAt >= Date.parse(start.sourceEndAt!)) return true;
    // A session's last trade can occur seconds before its published closing time.
    return sameSessionClose(quote, start);
  };
  const currentRate = (symbol: string) => {
    const quote = current(symbol);
    return quote && currentFollowsBaseline(quote, baseline(symbol)) ? quote.price : null;
  };
  const rate = (currency: string, atMidnight: boolean): number | null => {
    if (currency === displayCurrency) return 1;
    const fx = currency === "KRW" ? 1 : (atMidnight ? baseline(`${currency}KRW=X`)?.price : currentRate(`${currency}KRW=X`));
    const usd = displayCurrency === "KRW" ? 1 : (atMidnight ? baseline("USDKRW=X")?.price : currentRate("USDKRW=X"));
    return valid(fx) && valid(usd) ? fx / usd : null;
  };
  const result: PortfolioDailyChange = {
    date, available: true, change: 0, priceImpact: 0, fxImpact: 0, bySymbol: {}, reason: null,
  };
  for (const symbol of plan.symbols) {
    const opening = plan.opening.find((holding) => holding.symbol === symbol);
    const closing = plan.closing.find((holding) => holding.symbol === symbol);
    const trades = plan.trades.filter((tx) => tx.symbol === symbol);
    const start = opening ? baseline(symbol) : null;
    const end = closing ? current(symbol) : null;
    if (opening && !start) return unavailable("일부 종목의 자정 기준 시세가 없습니다");
    if (closing && !end) return unavailable("현재 시세를 확인하지 못했습니다");
    const currency = normalizeCurrency(end?.currency ?? start?.currency ?? trades[0]?.currency);
    if ((start && normalizeCurrency(start.currency!) !== currency) ||
      trades.some((tx) => !tx.currency || normalizeCurrency(tx.currency) !== currency))
      return unavailable("거래 통화 확인이 필요합니다");
    const startRate = rate(currency, true);
    const endRate = closing ? rate(currency, false) : startRate;
    if (startRate == null || endRate == null) return unavailable("자정 또는 현재 환율을 확인하지 못했습니다");
    // A stale quote must not run time backwards relative to the midnight price.
    if (end && !currentFollowsBaseline(end, start))
      return unavailable("현재 시세를 다시 확인하고 있습니다");
    const startPrice = end && sameSessionClose(end, start) ? end.price : start?.price;
    const initialNative = opening && start ? opening.quantity * startPrice! * currencyUnitScale(start.currency!) : 0;
    const finalNative = closing && end ? closing.quantity * end.price * currencyUnitScale(end.currency) : 0;
    let nativeFlow = 0;
    let convertedFlow = 0;
    for (const tx of trades) {
      const sign = tx.type === "buy" ? 1 : -1;
      const flow = (sign * tx.quantity * tx.price + tx.fee) * currencyUnitScale(tx.currency);
      let tradeRate: number;
      if (currency === displayCurrency) tradeRate = 1;
      else {
        const fx = currency === "KRW" ? 1 : tx.fxRateToKRW;
        const usd = displayCurrency === "KRW" ? 1 : tx.usdKrwRateAtTransaction;
        if (!valid(fx) || !valid(usd)) return unavailable("오늘 거래의 환율 기록이 필요합니다");
        tradeRate = fx / usd;
      }
      nativeFlow += flow;
      convertedFlow += flow * tradeRate;
    }
    const change = finalNative * endRate - initialNative * startRate - convertedFlow;
    const priceImpact = (finalNative - initialNative - nativeFlow) * startRate;
    if (!Number.isFinite(change) || !Number.isFinite(priceImpact)) return unavailable("보유 기록 확인이 필요합니다");
    result.bySymbol[symbol] = change;
    result.change += change;
    result.priceImpact += priceImpact;
    result.fxImpact += change - priceImpact;
  }
  return result;
}
