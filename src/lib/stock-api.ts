import type {
  ChartPoint,
  ChartSeries,
  DayOHLC,
  StockQuote,
  StockSearchResult,
} from "./types";
import { BASE_CURRENCY, normalizeCurrency } from "./currency";

export async function searchStocks(query: string): Promise<StockSearchResult[]> {
  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error("검색에 실패했습니다.");
  return res.json();
}

export async function getQuote(symbol: string): Promise<StockQuote> {
  const res = await fetch(`/api/quote/${encodeURIComponent(symbol)}`);
  if (!res.ok) throw new Error("시세 조회에 실패했습니다.");
  return res.json();
}

export async function getChart(symbol: string, range = "6mo"): Promise<ChartPoint[]> {
  const res = await fetch(
    `/api/chart/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}`
  );
  if (!res.ok) throw new Error("차트 데이터 조회에 실패했습니다.");
  return res.json();
}

export async function getChartSeries(
  symbol: string,
  start: string,
  end: string
): Promise<ChartSeries> {
  const params = new URLSearchParams({ start, end, detailed: "true" });
  const res = await fetch(
    `/api/chart/${encodeURIComponent(symbol)}?${params.toString()}`
  );
  if (!res.ok) {
    throw new Error(`차트 데이터 조회에 실패했습니다. (${symbol}, HTTP ${res.status})`);
  }
  return res.json();
}

export async function getHistoricalDay(symbol: string, date: string): Promise<DayOHLC> {
  const res = await fetch(
    `/api/historical/${encodeURIComponent(symbol)}?date=${encodeURIComponent(date)}`
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "과거 시세 조회에 실패했습니다.");
  }
  return res.json();
}

export async function getFxRateToKRW(currency: string, date?: string): Promise<number> {
  const normalized = normalizeCurrency(currency);
  if (normalized === BASE_CURRENCY) return 1;

  const pair = `${normalized}${BASE_CURRENCY}=X`;
  return date
    ? (await getHistoricalDay(pair, date)).close
    : (await getQuote(pair)).price;
}
