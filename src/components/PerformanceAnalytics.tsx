"use client";
import { useStockSearch } from "@/features/market/use-stock-search";
import { AssetChart, ReturnChart } from "@/features/performance/Charts";
import { DateField, MetricCard } from "@/features/performance/Controls";
import { useBenchmarkSeries } from "@/features/performance/use-benchmark-series";
import {
  RANGES,
  usePerformanceRange,
} from "@/features/performance/use-performance-range";

import { usePerformanceHistory } from "@/hooks/usePerformanceHistory";
import { useTransactions } from "@/hooks/usePortfolio";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { ChartSeries, StockSearchResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  CalendarRange,
  Check,
  ChevronDown,
  Loader2,
  Search,
  TrendingUp,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

type ChartMode = "return" | "assets";

export function PerformanceAnalytics() {
  const { transactions } = useTransactions();
  const { points, trackingStartedAt, loading, error } = usePerformanceHistory();
  const [chartMode, setChartMode] = useState<ChartMode>("return");
  const [datePanelOpen, setDatePanelOpen] = useState(false);
  const [query, setQuery] = useState("");

  const [benchmark, setBenchmark] = useState<StockSearchResult | null>(null);
  const { results: searchResults, loading: searching } = useStockSearch(query, {
    delay: 250,
    enabled: benchmark?.name !== query,
  });

  const {
    range,
    setRange,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    firstDate,
    lastDate,
    effectiveEnd,
    effectiveStart,
    normalizedPoints,
    metrics,
    inactivePeriods,
    entirelyInactive,
  } = usePerformanceRange(points, transactions);

  const { benchmarkSeries, benchmarkLoading, benchmarkError } =
    useBenchmarkSeries(benchmark?.symbol, effectiveStart, effectiveEnd);
  const chartData = useMemo(() => {
    const useAdjusted =
      benchmarkSeries?.dividendStatus !== "unavailable" &&
      benchmarkSeries?.points.some((point) => point.adjustedClose != null);
    const benchmarkValues = normalizedPoints.map((point) => {
      const candidate = latestBenchmarkValue(
        benchmarkSeries,
        point.date,
        Boolean(useAdjusted),
      );
      return { date: point.date, value: candidate };
    });
    const benchmarkBase = benchmarkValues.find(
      (point) => point.value != null,
    )?.value;

    return normalizedPoints.map((point, index) => ({
      ...point,
      benchmarkReturn:
        benchmarkBase && benchmarkValues[index].value != null
          ? (benchmarkValues[index].value! / benchmarkBase - 1) * 100
          : null,
    }));
  }, [benchmarkSeries, normalizedPoints]);

  const trackingLabel = trackingStartedAt
    ? formatTrackingAge(trackingStartedAt)
    : "기록 없음";

  if (!loading && points.length === 0) {
    return (
      <section className="rounded-2xl border border-[#e9eaed] bg-[#ffffff] px-5 py-16 text-center sm:px-7">
        <CalendarRange className="mx-auto h-6 w-6 text-[#3b8879]" />
        <h2 className="mt-4 font-semibold text-[#202329]">
          {error ? "성과 조회 실패" : "성과 기록 없음"}
        </h2>
        {error && <p role="alert" className="mt-2 text-cf-caption text-cf-negative">{error}</p>}
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[#e9eaed] bg-[#ffffff] ">
      {benchmarkError && (
        <p role="alert" className="text-sm text-[#d65353]">
          {benchmarkError}
        </p>
      )}
      <div className="border-b border-[#e9eaed] px-5 py-5 sm:px-7">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[#202329]">
              <TrendingUp className="h-4 w-4 text-[#3b8879]" />내 성과 기록
            </div>
            <p className="mt-1 text-xs text-[#727680]">
              전체 {trackingLabel} · 매일 23:59:59 KST 기준
            </p>
          </div>

          <div className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-[#f6f7f8] p-1">
            {RANGES.map((item) => (
              <button
                key={item.key}
                type="button"
                aria-pressed={range === item.key}
                onClick={() => setRange(item.key)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  range === item.key
                    ? "bg-[#202329] text-[#ffffff]"
                    : "text-[#727680] hover:text-[#202329]",
                )}
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              aria-expanded={datePanelOpen}
              onClick={() => setDatePanelOpen((open) => !open)}
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                range === "custom"
                  ? "bg-[#202329] text-[#ffffff]"
                  : "text-[#727680] hover:text-[#202329]",
              )}
            >
              직접 선택 <ChevronDown className="h-3 w-3" />
            </button>
          </div>
        </div>

        {datePanelOpen && firstDate && lastDate && (
          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-[#e9eaed] bg-[#f6f7f8] p-4 sm:flex-row sm:items-end">
            <DateField
              label="시작일"
              value={customStart || effectiveStart}
              min={firstDate}
              max={customEnd || lastDate}
              onChange={(value) => {
                setCustomStart(value);
                setRange("custom");
              }}
            />
            <DateField
              label="종료일"
              value={customEnd || effectiveEnd}
              min={customStart || firstDate}
              max={lastDate}
              onChange={(value) => {
                setCustomEnd(value);
                setRange("custom");
              }}
            />
            <button
              type="button"
              onClick={() => setDatePanelOpen(false)}
              className="flex h-10 items-center justify-center gap-1 rounded-xl bg-[#202329] px-4 text-sm font-semibold text-[#ffffff]"
            >
              <Check className="h-4 w-4" /> 적용
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-px bg-[#e9eaed] sm:grid-cols-3">
        <MetricCard
          label="운용수익률"
          value={
            entirelyInactive
              ? "미운용"
              : formatOptionalPercent(metrics.operatingReturn)
          }
          help="운용수익률(TWR): 자금 유입·유출의 영향을 제외한 기간별 투자 성과. 보유 자산과 매입원가의 차이인 평가손익과 구분합니다."
        />
        <MetricCard
          label="내 자금수익률"
          value={formatOptionalPercent(metrics.moneyWeightedReturn)}
          help="자금수익률(MWR): 기간 손익을 시작 자산과 기간 가중 순투입금의 합으로 나눈 수익률(Modified Dietz). 분모가 0 이하이면 계산 불가로 표시합니다."
        />
        <MetricCard
          label="선택 기간 손익"
          value={formatCurrency(metrics.profitKRW, "KRW")}
          description={`${formatCurrency(metrics.startValueKRW, "KRW")} → ${formatCurrency(metrics.endValueKRW, "KRW")}`}
        />
      </div>

      <div className="p-5 sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex rounded-full bg-[#f6f7f8] p-1">
            <button
              type="button"
              aria-pressed={chartMode === "return"}
              onClick={() => setChartMode("return")}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium",
                chartMode === "return"
                  ? "bg-[#ffffff] text-[#202329] shadow-sm"
                  : "text-[#727680]",
              )}
            >
              수익률 비교
            </button>
            <button
              type="button"
              aria-pressed={chartMode === "assets"}
              onClick={() => setChartMode("assets")}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium",
                chartMode === "assets"
                  ? "bg-[#ffffff] text-[#202329] shadow-sm"
                  : "text-[#727680]",
              )}
            >
              자산 추이
            </button>
          </div>

          <div className="relative w-full lg:w-80">
            {benchmark ? (
              <div className="flex h-10 items-center justify-between rounded-xl border border-[#dce7e2] bg-[#f2f7f5] px-3">
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-[#3b8879]">
                    {benchmark.symbol}
                  </span>
                  <span className="ml-2 truncate text-xs text-[#727680]">
                    {benchmark.name}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setBenchmark(null);
                    setQuery("");
                  }}
                  className="rounded-md p-1 text-[#727680] hover:text-[#202329]"
                  aria-label="비교 자산 제거"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <>
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#727680]" />
                <input
                  aria-label="비교할 주식·ETF·지수 검색"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="비교할 주식·ETF·지수 검색"
                  className="h-10 w-full rounded-xl border border-[#e9eaed] bg-[#ffffff] pl-9 pr-9 text-sm text-[#202329] outline-none placeholder:text-[#727680] focus:border-[#3b8879]"
                />
                {searching && (
                  <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#727680]" />
                )}
                {searchResults.length > 0 && (
                  <div className="absolute right-0 top-12 z-20 max-h-64 w-full overflow-y-auto rounded-2xl border border-[#e9eaed] bg-[#ffffff] p-1 shadow-2xl">
                    {searchResults.map((result) => (
                      <button
                        key={`${result.symbol}-${result.exchange}`}
                        type="button"
                        onClick={() => {
                          setBenchmark(result);
                          setQuery(result.name);
                        }}
                        className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-[#f6f7f8]"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-[#202329]">
                            {result.symbol}
                          </span>
                          <span className="block truncate text-xs text-[#727680]">
                            {result.name}
                          </span>
                        </span>
                        <span className="shrink-0 text-[11px] text-[#727680]">
                          {result.type}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="mt-6 h-72 sm:h-80">
          {loading && points.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-[#727680]">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 일별 기록 구성
              중
            </div>
          ) : chartMode === "return" ? (
            <ReturnChart
              data={chartData}
              inactivePeriods={inactivePeriods}
              benchmarkName={benchmark?.symbol}
            />
          ) : (
            <AssetChart data={chartData} inactivePeriods={inactivePeriods} />
          )}
        </div>

        {(inactivePeriods.length > 0 || benchmarkLoading || benchmarkSeries) && <div className="mt-4 flex flex-col gap-2 text-cf-caption text-cf-muted">
          {inactivePeriods.length > 0 && <p>회색 구간: 미운용 · 자산 0원, 수익률 고정</p>}
          {(benchmarkLoading || benchmarkSeries) && <p>{benchmarkLoading ? "비교 자료 확인 중" : dividendLabel(benchmarkSeries!)}</p>}
        </div>}
        {error && <p role="alert" className="mt-3 text-xs text-[#946a24]">{error}</p>}
      </div>
    </section>
  );
}

function latestBenchmarkValue(
  series: ChartSeries | null,
  date: string,
  adjusted: boolean,
): number | null {
  let value: number | null = null;
  for (const point of series?.points ?? []) {
    if (point.date > date) break;
    const candidate = adjusted ? point.adjustedClose : point.close;
    if (candidate != null && Number.isFinite(candidate)) value = candidate;
  }
  return value;
}

function formatOptionalPercent(value: number | null): string {
  return value == null || !Number.isFinite(value)
    ? "계산 불가"
    : formatPercent(value);
}

function dividendLabel(series: ChartSeries): string {
  if (series.dividendStatus === "confirmed_amount") return "배당 포함 총수익률";
  if (series.dividendStatus === "confirmed_zero")
    return "선택 기간 배당 0원 · 가격수익률과 동일";
  return "가격수익률 · 배당 자료 없음";
}

function formatTrackingAge(startedAt: string): string {
  const elapsed = Math.max(0, Date.now() - Date.parse(startedAt));
  const hours = Math.floor(elapsed / 3_600_000);
  if (hours < 24) return `${Math.max(1, hours)}시간`;
  return `${Math.floor(hours / 24) + 1}일`;
}
