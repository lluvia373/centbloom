import { addCalendarDays as addDays } from "@/lib/performance";
import type {
  ChartPoint,
  ChartSeries,
  DividendDataStatus,
  DividendEvent,
} from "@/lib/types";
import { MarketError, providerRequests, yahoo } from "./provider";
export function fetchChart(
  symbol: string,
  range: string,
  start: string | null,
  end: string | null,
  signal?: AbortSignal,
): Promise<ChartSeries> {
  return providerRequests.request(
    JSON.stringify(["chart", symbol, range, start, end]),
    async (signal) => {
      const period1 = start ?? getPeriodStart(range);
      const period2 = end ? addDays(end, 1) : undefined;
      const result = await yahoo.chart(
        symbol,
        {
          period1,
          ...(period2 ? { period2 } : {}),
          interval: start || range === "5d" || range === "1mo" ? "1d" : "1wk",
          events: "div",
        },
        { fetchOptions: { signal } },
      );

      const points: ChartPoint[] = (result.quotes ?? [])
        .filter(
          (q) => q.close != null && Number.isFinite(q.close) && q.close > 0,
        )
        .map((q) => ({
          date: q.date.toISOString().split("T")[0],
          close: q.close!,
          adjustedClose:
            q.adjclose == null || !Number.isFinite(q.adjclose)
              ? undefined
              : q.adjclose,
        }));

      if (!points.length)
        throw new MarketError(
          "해당 기간의 가격 데이터를 불러오지 못했습니다.",
          404,
        );
      const dividendRows = result.events?.dividends;
      const dividends: DividendEvent[] = (dividendRows ?? []).map((row) => ({
        date: row.date.toISOString().split("T")[0],
        amount: row.amount,
      }));
      const dividendStatus: DividendDataStatus =
        dividends.length > 0 ? "confirmed_amount" : "confirmed_zero";

      const series: ChartSeries = {
        symbol,
        points,
        dividendStatus,
        dividends,
      };

      return series;
    },
    { signal, ttlMs: 60000 },
  );
}
function getPeriodStart(range: string): string {
  const now = new Date();
  const map: Record<string, number> = {
    "5d": 5,
    "1mo": 30,
    "3mo": 90,
    "6mo": 180,
    "1y": 365,
    "5y": 365 * 5,
  };
  const days = map[range] ?? 180;
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return start.toISOString().split("T")[0];
}
