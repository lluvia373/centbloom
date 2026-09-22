import type { ChartPoint, ChartSeries } from "@/lib/types";

export type BenchmarkState = {
  symbol: string;
  series: ChartSeries | null;
  loading: boolean;
  error: string | null;
};

export type BenchmarkKey = `benchmark_${number}`;
export type BenchmarkComparison = {
  symbol: string;
  key: BenchmarkKey;
  dividendLabel: string;
  status: "ready" | "loading" | "error" | "missing-start";
  error: string | null;
};

function validPrice(value: number | undefined): value is number {
  return value != null && Number.isFinite(value) && value > 0;
}

function dividendLabel(series: ChartSeries, adjusted: boolean): string {
  if (series.dividendStatus === "confirmed_amount")
    return adjusted ? "배당 포함" : "가격 기준 · 배당 미반영";
  if (series.dividendStatus === "confirmed_zero") return "가격 기준 · 기간 내 배당 없음";
  return "가격 기준 · 배당 자료 없음";
}

export function buildBenchmarkData<T extends { date: string }>(
  points: readonly T[],
  benchmarks: readonly BenchmarkState[],
): { data: Array<T & Record<BenchmarkKey, number | null>>; comparisons: BenchmarkComparison[] } {
  const data = points.map((point) => ({ ...point })) as Array<T & Record<BenchmarkKey, number | null>>;
  const start = points[0]?.date;
  const end = points.at(-1)?.date;
  const comparisons = [...new Map(benchmarks.map((entry) => [entry.symbol, entry])).values()]
    .map((entry, index): BenchmarkComparison => {
      const key: BenchmarkKey = `benchmark_${index}`;
      data.forEach((point) => { (point as Record<BenchmarkKey, number | null>)[key] = null; });
      const result: BenchmarkComparison = {
        symbol: entry.symbol,
        key,
        dividendLabel: "",
        status: entry.loading ? "loading" : entry.error ? "error" : "missing-start",
        error: entry.error,
      };
      if (entry.loading || entry.error || !entry.series || !start || !end) return result;

      const quotes = entry.series.points.filter((point) => point.date <= end)
        .toSorted((a, b) => a.date.localeCompare(b.date));
      let baselineIndex = -1;
      // Include the selected first day's movement, just like the securities return.
      for (let i = 0; i < quotes.length && quotes[i].date < start; i++) baselineIndex = i;
      const baseline = quotes[baselineIndex];
      // No later inception/first quote may become a fake zero at the selected start.
      if (!baseline || !validPrice(baseline.close)) return result;
      const relevant = quotes.slice(baselineIndex);
      const adjusted = entry.series.dividendStatus !== "unavailable" &&
        relevant.every((point) => validPrice(point.adjustedClose));
      const price = (point: ChartPoint) => adjusted ? point.adjustedClose : point.close;
      const base = price(baseline)!;
      result.dividendLabel = dividendLabel(entry.series, adjusted);
      result.status = "ready";
      let cursor = baselineIndex;
      for (const point of data) {
        while (cursor + 1 < quotes.length && quotes[cursor + 1].date <= point.date) cursor++;
        const value = price(quotes[cursor]);
        const valueReturn = validPrice(value) ? (value / base - 1) * 100 : null;
        // An absent daily row carries the prior close; an explicit invalid row remains a gap.
        (point as Record<BenchmarkKey, number | null>)[key] =
          valueReturn != null && Number.isFinite(valueReturn) ? valueReturn : null;
      }
      return result;
    });
  return { data, comparisons };
}
