"use client";
import { useStockSearch } from "@/features/market/use-stock-search";
import { AssetChart, ReturnChart } from "@/features/performance/Charts";
import { DateField, PerformanceSummary } from "@/features/performance/Controls";
import { getAssetAxis } from "@/features/performance/chart-presentation";
import { useBenchmarkSeries } from "@/features/performance/use-benchmark-series";
import {
  RANGES,
  usePerformanceRange,
} from "@/features/performance/use-performance-range";

import { usePerformanceHistory } from "@/hooks/usePerformanceHistory";
import { usePortfolioMarket, usePreferences, useTransactions } from "@/hooks/usePortfolio";
import type { ChartSeries, StockSearchResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CalendarDays, Loader2, Search, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";

type ChartMode = "return" | "assets";

export function PerformanceAnalytics() {
  const { transactions } = useTransactions();
  const { summary } = usePortfolioMarket();
  const { displayCurrency } = usePreferences();
  const { points, loading, error } = usePerformanceHistory();
  const [chartMode, setChartMode] = useState<ChartMode>("assets");
  const [query, setQuery] = useState("");
  const rangeButton = useRef<HTMLButtonElement>(null);
  const [rangeSelection, setRangeSelection] = useState<{ step: "start" } | { step: "end"; start: string } | null>(null);

  const [benchmark, setBenchmark] = useState<StockSearchResult | null>(null);
  const { results: searchResults, loading: searching } = useStockSearch(query, {
    delay: 250,
    enabled: chartMode === "return" && benchmark?.name !== query,
  });

  const currencyHolding = summary?.holdings.find((holding) =>
    holding.valuationAvailable && Number.isFinite(holding.marketValueKRW) &&
    holding.marketValueKRW > 0 && Number.isFinite(holding.marketValueUSD) && holding.marketValueUSD > 0,
  );
  const usdKrwRate = currencyHolding
    ? currencyHolding.marketValueKRW / currencyHolding.marketValueUSD
    : null;
  const assetCurrency = displayCurrency === "USD" && usdKrwRate != null ? "USD" : "KRW";
  const assetDivisor = assetCurrency === "USD" ? usdKrwRate! : 1;

  const {
    range,
    setRange,
    setCustomStart,
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
    useBenchmarkSeries(chartMode === "return" ? benchmark?.symbol : undefined, effectiveStart, effectiveEnd);
  const chartData = useMemo(() => {
    const useAdjusted =
      benchmarkSeries?.dividendStatus !== "unavailable" &&
      benchmarkSeries?.points.some((point) => point.adjustedClose != null && Number.isFinite(point.adjustedClose));
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
  const assetData = useMemo(() => normalizedPoints.map((point) => ({
    ...point,
    assetValue: point.assetValueKRW / assetDivisor,
  })), [normalizedPoints, assetDivisor]);
  const dateReady = Boolean(firstDate && lastDate);
  const loadingInitial = loading && points.length === 0;
  const dismissRange = (restoreFocus: boolean) => {
    setRangeSelection(null);
    if (restoreFocus) rangeButton.current?.focus();
  };

  return (
    <div className="performance-panel">
      <h2 className="performance-heading">기간 성과</h2>
      {!loading && points.length === 0 ? (
        <div className="performance-card performance-empty">
          <p>{error ? "성과 조회 실패" : "성과 기록 없음"}</p>
          {error && <p role="alert" className="performance-notice text-cf-negative">{error}</p>}
        </div>
      ) : (
        <div className="performance-card" aria-busy={loading}>
          <div className="performance-period">
            <div className="performance-ranges" role="group" aria-label="조회 기간">
              {RANGES.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={range === item.key}
                  disabled={!dateReady}
                  onClick={() => setRange(item.key)}
                  className="performance-choice"
                >{item.label}</button>
              ))}
            </div>
            {dateReady && <div className="performance-dates" role="group" aria-label="조회 날짜">
              <button ref={rangeButton} type="button" className="performance-date-trigger" aria-label="기간 선택" aria-haspopup="dialog" aria-expanded={rangeSelection !== null} onClick={() => setRangeSelection({ step: "start" })}>
                <CalendarDays className="performance-date-icon" aria-hidden="true" />
              </button>
              <DateField
                label="시작일"
                value={effectiveStart}
                min={firstDate}
                max={effectiveEnd}
                rangeStart={effectiveStart}
                rangeEnd={effectiveEnd}
                picker={rangeSelection?.step === "start" ? {
                  value: effectiveStart, min: firstDate, max: lastDate,
                  onSelect: (start) => setRangeSelection({ step: "end", start }),
                  onDismiss: dismissRange,
                } : undefined}
                onChange={(value) => {
                  if (!value || value < firstDate || value > effectiveEnd) return;
                  setCustomStart(value);
                  setCustomEnd(effectiveEnd);
                  setRange("custom");
                }}
              />
              <span className="performance-date-separator" aria-hidden="true">–</span>
              <DateField
                label="종료일"
                value={effectiveEnd}
                min={effectiveStart}
                max={lastDate}
                rangeStart={rangeSelection?.step === "end" ? rangeSelection.start : effectiveStart}
                rangeEnd={rangeSelection?.step === "end" ? undefined : effectiveEnd}
                picker={rangeSelection?.step === "end" ? {
                  value: rangeSelection.start, min: rangeSelection.start, max: lastDate,
                  onSelect: (end) => {
                    setCustomStart(rangeSelection.start);
                    setCustomEnd(end);
                    setRange("custom");
                    dismissRange(true);
                  },
                  onDismiss: dismissRange,
                } : undefined}
                onChange={(value) => {
                  if (!value || value < effectiveStart || value > lastDate) return;
                  setCustomStart(effectiveStart);
                  setCustomEnd(value);
                  setRange("custom");
                }}
              />
            </div>}
          </div>

          {loadingInitial ? (
            <div className="performance-empty" role="status">
              <Loader2 className="performance-spinner" aria-hidden="true" /> 성과 불러오는 중
            </div>
          ) : <>
            <div className="performance-results">
              <PerformanceSummary
                profitKRW={metrics.profitKRW}
                returnPercent={metrics.moneyWeightedReturn}
                inactive={entirelyInactive}
              />
            </div>

            <div className="performance-chart-section">
              <div className="performance-toolbar">
                <div className="performance-modes" role="group" aria-label="차트 종류">
                  <button type="button" className="performance-choice" aria-pressed={chartMode === "assets"} onClick={() => setChartMode("assets")}>보유자산 추이</button>
                  <button type="button" className="performance-choice" aria-pressed={chartMode === "return"} onClick={() => setChartMode("return")}>수익률 비교</button>
                </div>
                {chartMode === "return" && <div className="performance-search">
                  {benchmark ? (
                    <div className="performance-benchmark">
                      <span className="performance-benchmark-name">{benchmark.name}<small>{benchmark.symbol}</small></span>
                      <button
                        type="button"
                        className="performance-remove"
                        onClick={() => { setBenchmark(null); setQuery(""); }}
                        aria-label="비교 자산 제거"
                      ><X aria-hidden="true" /></button>
                    </div>
                  ) : <>
                    <Search className="performance-search-icon" aria-hidden="true" />
                    <input
                      aria-label="비교할 주식·ETF·지수 검색"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="비교할 주식·ETF·지수"
                      className="performance-input"
                    />
                    {searching && <Loader2 className="performance-search-loading" aria-label="검색 중" />}
                    {searchResults.length > 0 && <div className="performance-search-results" aria-label="비교 종목 검색 결과">
                      {searchResults.map((result) => (
                        <button key={`${result.symbol}-${result.exchange}`} type="button" onClick={() => { setBenchmark(result); setQuery(result.name); }}>
                          <span>{result.name}<small>{result.symbol}</small></span>
                        </button>
                      ))}
                    </div>}
                  </>}
                </div>}
              </div>

              <div className="performance-chart-meta">
                <div className="performance-legend" aria-label="차트 범례">
                  <span><i className="performance-line-key" aria-hidden="true" />{chartMode === "assets" ? "보유자산" : "내 수익률"}</span>
                  {chartMode === "return" && benchmark ? <span><i className="performance-line-key performance-line-key-dashed" aria-hidden="true" />{benchmark.symbol} 참고 수익률</span> : null}
                  {inactivePeriods.length > 0 && <span><i className="performance-inactive-key" aria-hidden="true" />미보유 기간</span>}
                </div>
                <span className="performance-currency">
                  {chartMode === "return" ? "내 수익률 KRW 기준" : `단위: ${getAssetAxis(assetData, assetCurrency).unitLabel}${assetCurrency === "USD" ? " · 현재 환율 환산" : ""}`}
                </span>
              </div>
              {chartMode === "assets" && displayCurrency === "USD" && assetCurrency === "KRW" && <p role="status" className="performance-notice text-cf-warning">달러 환율 확인 필요 · 원화로 표시</p>}
              {chartMode === "return" && benchmark && (benchmarkLoading || benchmarkSeries || benchmarkError) && <p
                role={benchmarkError ? "alert" : "status"}
                className={cn("performance-notice", benchmarkError ? "text-cf-negative" : "text-cf-muted")}
              >{benchmarkError ?? (benchmarkLoading ? "비교 자료 불러오는 중" : `${benchmark.symbol} · 현지 통화 · ${dividendLabel(benchmarkSeries!)} · 내 매매 미반영`)}</p>}
              <div className="performance-chart" role="region" aria-label={chartMode === "assets" ? "보유자산 추이 그래프" : "수익률 비교 그래프"}>
                {chartMode === "return" ? (
                  <ReturnChart data={chartData} inactivePeriods={inactivePeriods} benchmarkName={benchmark?.symbol} />
                ) : (
                  <AssetChart data={assetData} inactivePeriods={inactivePeriods} currency={assetCurrency} />
                )}
              </div>
            </div>
          </>}
          {error && <p role="alert" className="performance-error">{error}</p>}
        </div>
      )}
    </div>
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

function dividendLabel(series: ChartSeries): string {
  if (series.dividendStatus === "confirmed_amount" && series.points.some((point) => point.adjustedClose != null && Number.isFinite(point.adjustedClose))) return "배당 포함";
  if (series.dividendStatus === "confirmed_amount") return "가격 기준 · 배당 미반영";
  if (series.dividendStatus === "confirmed_zero") return "가격 기준 · 기간 내 배당 없음";
  return "가격 기준 · 배당 자료 없음";
}
