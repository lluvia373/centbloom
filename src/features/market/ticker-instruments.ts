import type { StockQuote } from "@/lib/types";

export const tickerInstruments = [
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^IXIC", label: "NASDAQ" },
  { symbol: "^NDX", label: "NASDAQ 100" },
  { symbol: "^DJI", label: "DOW" },
  { symbol: "^RUT", label: "RUSSELL 2000" },
  { symbol: "^SOX", label: "PHLX 반도체" },
  { symbol: "^VIX", label: "VIX", note: "변동성 지수 · 상승은 주가 상승을 뜻하지 않음" },
  { symbol: "^KS11", label: "KOSPI" },
  { symbol: "^KQ11", label: "KOSDAQ" },
  { symbol: "^N225", label: "닛케이 225" },
  { symbol: "^HSI", label: "항셍" },
  { symbol: "000001.SS", label: "상하이 종합" },
  { symbol: "^STOXX50E", label: "EURO STOXX 50" },
  { symbol: "^GDAXI", label: "DAX" },
  { symbol: "^FTSE", label: "FTSE 100" },
  { symbol: "^TNX", label: "미국 10년물", note: "국채 수익률 · 변동폭은 bp (1bp = 0.01%p)" },
  { symbol: "DX-Y.NYB", label: "달러 인덱스" },
  { symbol: "KRW=X", label: "USD/KRW" },
];
export const tickerSymbols = tickerInstruments.map(({ symbol }) => symbol);
const priceFormat = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function formatTickerQuote(symbol: string, quote: StockQuote) {
  const yieldRate = symbol === "^TNX";
  const change = yieldRate ? quote.change * 100 : quote.changePercent;
  return {
    price: yieldRate ? quote.price.toFixed(3) + "%" : priceFormat.format(quote.price),
    change: (change > 0 ? "+" : "") + change.toFixed(2) + (yieldRate ? "bp" : "%"),
    direction: change === 0 ? "flat" : change > 0 ? "up" : "down",
  };
}
