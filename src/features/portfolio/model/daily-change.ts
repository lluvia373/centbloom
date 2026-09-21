import { currencyUnitScale, normalizeCurrency } from "@/lib/currency";
import { deriveHoldings } from "@/lib/portfolio";
import type { DisplayCurrency, StockQuote, Transaction } from "@/lib/types";
import type { MidnightBaseline } from "@/features/market/baseline";
import { FX_LOOKBACK, usableFxQuote } from "@/features/market/fx";
import { formatKst, localParts } from "@/features/market/schedule/time";

export interface PortfolioDailyChange {
  date: string;
  available: boolean;
  change: number;
  priceImpact: number;
  fxImpact: number;
  bySymbol: Record<string, number>;
  reason: string | null;
  estimated: boolean;
  estimatedSymbols: string[];
  fxNotes: string[];
  referenceDates: string[];
  referenceDatesBySymbol: Record<string, string[]>;
  carriedDates: string[];
  carriedDatesBySymbol: Record<string, string[]>;
}

export function unavailableDailyChange(date: string, reason: string): PortfolioDailyChange {
  return { date, available: false, change: 0, priceImpact: 0, fxImpact: 0, bySymbol: {}, reason,
    estimated: false, estimatedSymbols: [], fxNotes: [], referenceDates: [], referenceDatesBySymbol: {},
    carriedDates: [], carriedDatesBySymbol: {} };
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
    if (item?.date !== date || Date.parse(item.baselineAt) !== cutoff ||
      item.status !== "available" || !valid(item.price) || !item.currency) return null;
    if (item.precision === "daily-reference") {
      const referenceDate = item.fx?.referenceDate;
      if (item.source !== "ecb-reference" || item.fx?.method !== "ecb-reference" ||
        !referenceDate || !/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) return null;
      const referenceDay = Date.parse(`${referenceDate}T00:00:00+09:00`);
      if (!Number.isFinite(referenceDay) || referenceDate >= date || cutoff - referenceDay > FX_LOOKBACK) return null;
      if (item.fx.publishedAt && !(Date.parse(item.fx.publishedAt) <= cutoff)) return null;
      return item; // A daily fixing has a date, not a fabricated observation timestamp.
    }
    return item.sourceEndAt && Date.parse(item.sourceEndAt) <= cutoff ? item : null;
  };
  const sameFxObservation = (quote: StockQuote, start: MidnightBaseline | null) => {
    if (!start?.fx || start.precision !== "minute") return false;
    const quotedAt = Date.parse(quote.quotedAt ?? "");
    return quotedAt >= Date.parse(start.sourceAt!) && quotedAt <= Date.parse(start.sourceEndAt!) &&
      Date.parse(quote.fetchedAt ?? "") >= cutoff && (quote.price === start.price ||
        (Math.fround(start.price!) === start.price && Math.fround(quote.price) === start.price));
  };
  const current = (symbol: string) => {
    const item = quotes[symbol];
    return !failedSymbols.includes(symbol) && item && valid(item.price) ? item : null;
  };
  const sameSessionClose = (quote: StockQuote, start: MidnightBaseline | null) => {
    if (!start || start.marketClosed !== true || quote.marketState !== "CLOSED") return false;
    if (start.precision !== "session-close" && !(start.precision === "minute" && start.fx)) return false;
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
    if (start.precision === "daily-reference") {
      // Publication time is availability metadata, not a trade time. Compare only
      // the reference's European date; still reject a quote from an earlier day.
      return localParts(quotedAt, "Europe/Berlin").date >= start.fx!.referenceDate!;
    }
    if (quotedAt >= Date.parse(start.sourceEndAt!)) return true;
    // A session's last trade can occur seconds before its published closing time.
    return sameSessionClose(quote, start) || sameFxObservation(quote, start);
  };
  const currentRate = (symbol: string) => {
    const quote = current(symbol);
    if (!quote || quote.currency !== "KRW") return null;
    const fetched = Date.parse(quote.fetchedAt ?? ""), quoted = Date.parse(quote.quotedAt ?? "");
    if (fetched < cutoff || !usableFxQuote(quoted, fetched, quote.marketState)) return null;
    return currentFollowsBaseline(quote, baseline(symbol)) ? quote.price : null;
  };
  const fxNotes = new Set<string>();
  let missingFx = "";
  const midnightRate = (symbol: string) => {
    const item = baseline(symbol);
    if (!item || item.currency !== "KRW") return null;
    const pair = symbol.replace("KRW=X", "/KRW");
    const note = item.fx?.method === "ecb-reference"
      ? `${pair} 자정 기준: ${item.fx.referenceDate} ECB 일별 환율 적용`
      : `${pair} 자정 기준: ${formatKst(Date.parse(item.sourceEndAt!))} KST${item.marketClosed ? " · 주말 마감 무렵" : ""}${item.fx?.method === "usd-cross" ? " · 같은 분의 달러 환율로 계산" : ""}`;
    fxNotes.add(note);
    const end = current(symbol);
    // Reconcile the same closed FX observation's float32 chart representation,
    // just as for stock closes; do not manufacture a weekend FX gain from encoding precision.
    return end && currentRate(symbol) != null && sameFxObservation(end, item) ? end.price : item.price;
  };
  const fxRate = (symbol: string, atMidnight: boolean) => {
    const value = atMidnight ? midnightRate(symbol) : currentRate(symbol);
    if (value == null) missingFx = symbol.replace("KRW=X", "/KRW");
    else if (!atMidnight) fxNotes.add(`${symbol.replace("KRW=X", "/KRW")} 현재: ${formatKst(Date.parse(quotes[symbol].quotedAt!))} KST`);
    return value;
  };
  const rate = (currency: string, atMidnight: boolean): number | null => {
    if (currency === displayCurrency) return 1;
    const fx = currency === "KRW" ? 1 : fxRate(`${currency}KRW=X`, atMidnight);
    const usd = displayCurrency === "KRW" ? 1 : fxRate("USDKRW=X", atMidnight);
    return valid(fx) && valid(usd) ? fx / usd : null;
  };
  const result: PortfolioDailyChange = {
    date, available: true, change: 0, priceImpact: 0, fxImpact: 0, bySymbol: {}, reason: null,
    estimated: false, estimatedSymbols: [], fxNotes: [], referenceDates: [], referenceDatesBySymbol: {},
    carriedDates: [], carriedDatesBySymbol: {},
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
    if (startRate == null) return unavailable(`${missingFx} 자정 기준 환율을 확인하지 못했습니다`);
    const endRate = closing ? rate(currency, false) : startRate;
    if (endRate == null) return unavailable(`${missingFx} 현재 환율을 확인하지 못했습니다`);
    const rateSymbols = currency === displayCurrency ? [] : [
      ...(currency === "KRW" ? [] : [`${currency}KRW=X`]), ...(displayCurrency === "USD" ? ["USDKRW=X"] : []),
    ];
    if (rateSymbols.some(fxSymbol => baseline(fxSymbol)?.precision === "daily-reference")) result.estimatedSymbols.push(symbol);
    const referenceDates = rateSymbols.flatMap(fxSymbol => {
      const item = baseline(fxSymbol);
      return item?.precision === "daily-reference" && item.fx?.referenceDate ? [item.fx.referenceDate] : [];
    });
    const carriedDates = rateSymbols.flatMap(fxSymbol => {
      const startFx = baseline(fxSymbol), endFx = closing ? current(fxSymbol) : null;
      return [startFx?.fx?.carried ? startFx.sourceAt : null, endFx?.fx?.carried ?
        (endFx.fx.components[0]?.sourceAt ?? endFx.quotedAt) : null]
        .filter((at): at is string => !!at).map(at => localParts(Date.parse(at), "Asia/Seoul").date);
    });
    if (referenceDates.length) result.referenceDatesBySymbol[symbol] = [...new Set(referenceDates)].sort();
    if (carriedDates.length) result.carriedDatesBySymbol[symbol] = [...new Set(carriedDates)].sort();
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
  result.estimated = result.estimatedSymbols.length > 0;
  result.referenceDates = [...new Set(Object.values(result.referenceDatesBySymbol).flat())].sort();
  result.carriedDates = [...new Set(Object.values(result.carriedDatesBySymbol).flat())].sort();
  result.fxNotes = [...fxNotes];
  return result;
}
