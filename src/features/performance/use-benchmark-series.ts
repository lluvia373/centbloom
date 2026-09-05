"use client";
import { addCalendarDays } from "@/lib/performance";
import { getChartSeries } from "@/lib/stock-api";
import type { ChartSeries } from "@/lib/types";
import { useEffect, useState } from "react";
export function useBenchmarkSeries(
  symbol: string | undefined,
  start: string,
  end: string,
) {
  const key = JSON.stringify([symbol, start, end]);
  const [state, setState] = useState<{
    key: string;
    series: ChartSeries | null;
    error: string | null;
  }>({ key: "", series: null, error: null });
  const enabled = !!symbol && !!start && !!end;
  useEffect(() => {
    if (!symbol || !start || !end) return;
    const controller = new AbortController();
    void getChartSeries(
      symbol,
      addCalendarDays(start, -7),
      end,
      controller.signal,
    )
      .then((series) => {
        if (!controller.signal.aborted) setState({ key, series, error: null });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({
            key,
            series: null,
            error: "비교 종목 차트를 불러오지 못했습니다.",
          });
      });
    return () => controller.abort();
  }, [symbol, start, end, key]);
  return {
    benchmarkSeries: enabled && state.key === key ? state.series : null,
    benchmarkLoading: enabled && state.key !== key,
    benchmarkError: enabled && state.key === key ? state.error : null,
  };
}
