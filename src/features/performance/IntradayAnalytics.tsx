"use client";
import type { IntradayRange } from "@/features/market/intraday";
import type { DisplayCurrency, StockSearchResult } from "@/lib/types";
import { Loader2 } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { AssetChart, PORTFOLIO_LINE, ReturnChart } from "./Charts";
import type { ComparisonItem } from "./ComparisonList";
import { PerformanceSummary } from "./Controls";
import { getAssetAxis } from "./chart-presentation";
import { useIntradayPerformance } from "./use-intraday-performance";
import { useIntradayBenchmarks } from "./use-intraday-benchmarks";

export function IntradayAnalytics({ range, currency, mode, selected, focusedSymbol, renderComparisons }: {
  range: IntradayRange;
  currency: DisplayCurrency;
  mode: "assets" | "return";
  selected: Array<StockSearchResult & { colorIndex: number }>;
  focusedSymbol: string | null;
  renderComparisons: (items: ComparisonItem[], active: string | null, retry: (symbol: string) => void) => ReactNode;
}) {
  const { value, loading, error, day } = useIntradayPerformance(range, currency);
  const { benchmarks, retry } = useIntradayBenchmarks(mode === "return" ? selected.map(item => item.symbol) : [], range, day);
  const { data, comparisons } = useMemo(() => {
    const data: Array<Record<string, unknown>> = value.points.map(point => ({ ...point }));
    const comparisons: ComparisonItem[] = benchmarks.map((item, index) => {
      const key = `intraday_${index}`;
      const choice = selected.find(choice => choice.symbol === item.symbol)!;
      const base = item.series?.points[0]?.close;
      const byTime = new Map(item.series?.points.map(point => [point.at, point.close]));
      for (const point of data) {
        const close = byTime.get(String(point.date));
        point[key] = base != null && base > 0 && close != null ? (close / base - 1) * 100 : null;
      }
      return { key, name: item.symbol, symbol: item.symbol, fullName: choice.name,
        color: `var(--cf-color-comparison-${choice.colorIndex})`,
        value: data.at(-1)?.[key] as number | null ?? null,
        status: item.error ? "error" : item.loading && !item.series ? "loading" : base == null ? "missing-start" : "ready",
        detail: item.error ? "조회 실패" : item.loading && !item.series ? "불러오는 중" : base == null ? "시작 시각 시세 없음" : "가격 기준" };
    });
    return { data, comparisons };
  }, [value.points, benchmarks, selected]);
  const active = focusedSymbol === PORTFOLIO_LINE.key ? PORTFOLIO_LINE.key
    : comparisons.find(item => item.symbol === focusedSymbol)?.key ?? null;
  const hasValue = data.some(point => typeof point[mode === "assets" ? "assetValue" : "portfolioReturn"] === "number" ||
    (mode === "return" && comparisons.some(item => typeof point[item.key] === "number")));
  return <div className="performance-chart-section" aria-busy={loading}>
    <div className="performance-toolbar">
      <PerformanceSummary profitKRW={value.profitKRW ?? NaN} />
      <div className="performance-chart-meta">
        <span className="performance-currency">{range === "1d" ? "1분" : "30분"} 간격 · KST · {mode === "return" ? "내 수익률 KRW 기준" : `단위: ${getAssetAxis(data, currency).unitLabel}`}</span>
      </div>
    </div>
    {error && <p className="performance-notice text-cf-negative" role="alert">{value.points.length ? "갱신하지 못해 이전 결과를 표시합니다." : error}</p>}
    {value.tradeDates.length > 0 && <p className="performance-notice text-cf-muted" role="status">{mode === "assets"
      ? "거래 시각이 없는 날은 그래프가 비어 있습니다. 해당 날짜의 자산은 일별 그래프에서 확인할 수 있습니다."
      : "거래 시각이 없어 이 기간의 분 단위 수익률은 계산할 수 없습니다. 일별 수익률을 확인해 주세요."}</p>}
    {value.missingMarketData && <p className="performance-notice text-cf-muted" role="status">시세·환율을 확인하지 못한 구간은 비워 두었습니다.</p>}
    <div className="performance-chart" role="region" aria-label={mode === "assets" ? "보유자산 추이 그래프" : "수익률 비교 그래프"}>
      {loading && !data.length ? <div className="performance-empty" role="status"><Loader2 className="performance-spinner" aria-hidden="true" />시간별 시세 불러오는 중</div>
        : !hasValue ? <div className="performance-empty" role="status">{error ? "시간별 시세 조회 실패" : "표시할 시간별 값이 없습니다."}</div>
          : mode === "assets" ? <AssetChart data={data} currency={currency} inactivePeriods={[]} intraday={range} />
            : <ReturnChart data={data} inactivePeriods={[]} intraday={range} comparisons={comparisons} activeKey={active} />}
    </div>
    <p className="performance-comparison-basis">시세는 지연될 수 있습니다.</p>
    {mode === "return" && renderComparisons([
      { ...PORTFOLIO_LINE, value: value.points.at(-1)?.portfolioReturn ?? null,
        detail: value.tradeDates.length ? "거래 시각 미기록" : value.points.length && value.points.every(point => point.assetValueKRW === 0) ? "미운용" : "" },
      ...comparisons,
    ], active, retry)}
  </div>;
}
