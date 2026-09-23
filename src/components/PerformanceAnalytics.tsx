"use client";
import { useStockSearch } from "@/features/market/use-stock-search";
import { AssetChart, ReturnChart, PORTFOLIO_LINE } from "@/features/performance/Charts";
import { PerformanceDateControls, PerformanceSummary } from "@/features/performance/Controls";
import { ComparisonList, MAX_COMPARISONS, type ComparisonItem } from "@/features/performance/ComparisonList";
import { IntradayAnalytics } from "@/features/performance/IntradayAnalytics";
import { buildBenchmarkData } from "@/features/performance/benchmark-data";
import { getAssetAxis } from "@/features/performance/chart-presentation";
import { useBenchmarkSeries } from "@/features/performance/use-benchmark-series";
import {
  usePerformanceRange,
} from "@/features/performance/use-performance-range";

import { usePerformanceHistory } from "@/hooks/usePerformanceHistory";
import { usePortfolioMarket, usePreferences, useTransactions } from "@/hooks/usePortfolio";
import type { StockSearchResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Loader2, Search } from "lucide-react";
import { useMemo, useState } from "react";

type ChartMode = "return" | "assets";

export function PerformanceAnalytics() {
  const { transactions } = useTransactions();
  const { currentUsdKrwRate } = usePortfolioMarket();
  const { displayCurrency } = usePreferences();
  const { points, loading, error, refreshError, scopeKey } = usePerformanceHistory();
  const [chartMode, setChartMode] = useState<ChartMode>("assets");
  const [query, setQuery] = useState("");

  const [selected, setSelected] = useState<Array<StockSearchResult & { colorIndex: number }>>([]);
  const [focusedSymbol, setFocusedSymbol] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const { results: searchResults, loading: searching, error: searchError } = useStockSearch(query, {
    delay: 250,
    enabled: chartMode === "return" && selected.length < MAX_COMPARISONS && searchOpen,
  });
  const availableResults = searchResults.filter((result) => !selected.some((item) => item.symbol === result.symbol.trim().toUpperCase()));
  const addComparison = (result: StockSearchResult) => {
    const symbol = result.symbol.trim().toUpperCase();
    setSelected((current) => {
      if (!symbol || current.length >= MAX_COMPARISONS || current.some((item) => item.symbol === symbol)) return current;
      const colorIndex = Array.from({ length: MAX_COMPARISONS }, (_, index) => index + 1)
        .find((index) => !current.some((item) => item.colorIndex === index))!;
      return [...current, { ...result, symbol, colorIndex }];
    });
    setQuery("");
  };

  const usdKrwRate = currentUsdKrwRate != null && Number.isFinite(currentUsdKrwRate) && currentUsdKrwRate > 0
    ? currentUsdKrwRate : null;
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
  const intradayRange = range === "1d" || range === "5d" ? range : null;

  const { benchmarks, retry } = useBenchmarkSeries(
    chartMode === "return" && !intradayRange ? selected.map((item) => item.symbol) : [], effectiveStart, effectiveEnd,
  );
  const { data: chartData, comparisons } = useMemo(
    () => buildBenchmarkData(normalizedPoints, benchmarks), [benchmarks, normalizedPoints],
  );
  const comparisonLines = comparisons.map((item) => ({ ...item, name: item.symbol,
    color: `var(--cf-color-comparison-${selected.find((choice) => choice.symbol === item.symbol)!.colorIndex})`,
  }));
  const activeKey = focusedSymbol === PORTFOLIO_LINE.key ? PORTFOLIO_LINE.key
    : comparisonLines.find((item) => item.symbol === focusedSymbol && item.status === "ready")?.key ?? null;
  const assetData = useMemo(() => normalizedPoints.map((point) => ({
    ...point,
    assetValue: point.assetValueKRW / assetDivisor,
  })), [normalizedPoints, assetDivisor]);
  const viewKey = JSON.stringify([scopeKey, effectiveStart, effectiveEnd]);
  const [lastCompleteView, setLastCompleteView] = useState<string | null>(null);
  if (!loading && !refreshError && points.length > 0 && lastCompleteView !== viewKey)
    setLastCompleteView(viewKey);
  const showingPrevious = Boolean(refreshError && points.length > 0 && lastCompleteView === viewKey);
  const unresolvedView = Boolean(refreshError && !showingPrevious);
  const loadingInitial = loading && (points.length === 0 || unresolvedView);
  const renderComparisonPanel = (items: ComparisonItem[], active: string | null, onRetry: (symbol: string) => void) => (
    <div className="performance-comparison-panel">
      <div className="performance-search"
        onFocus={() => setSearchOpen(true)}
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setSearchOpen(false); }}>
        <Search className="performance-search-icon" aria-hidden="true" />
        <input aria-label="비교할 주식·ETF·지수 검색" value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") { setSearchOpen(false); setQuery(""); }
            if (event.key === "Enter" && searchOpen && availableResults[0]) { event.preventDefault(); addComparison(availableResults[0]); }
          }}
          disabled={selected.length >= MAX_COMPARISONS}
          placeholder={selected.length >= MAX_COMPARISONS ? `최대 ${MAX_COMPARISONS}개 비교 중` : "비교할 주식·ETF·지수 추가"}
          className="performance-input" />
        {searching && <Loader2 className="performance-search-loading" aria-label="검색 중" />}
        {searchOpen && query.trim() && !searching && <div className="performance-search-results" aria-label="비교 종목 검색 결과">
          {availableResults.map((result) => <button key={`${result.symbol}-${result.exchange}`} type="button" onClick={() => addComparison(result)}>
            <span>{result.name}<small>{result.symbol}</small></span>
          </button>)}
          {searchError ? <p role="alert">{searchError}</p> : availableResults.length === 0 && <p role="status">{searchResults.length ? "이미 비교 중인 종목입니다." : "검색 결과 없음"}</p>}
        </div>}
      </div>
      <ComparisonList items={items} activeKey={active}
        onFocus={(key) => {
          const symbol = key === PORTFOLIO_LINE.key ? key : items.find(item => item.key === key)?.symbol ?? null;
          setFocusedSymbol(current => current === symbol ? null : symbol);
        }}
        onRemove={(symbol) => {
          setSelected(current => current.filter(item => item.symbol !== symbol));
          setFocusedSymbol(current => current === symbol ? null : current);
        }} onRetry={onRetry} />
      {selected.length > 0 && <p className="performance-comparison-basis">비교 종목: 현지 통화 · 내 매매 미반영</p>}
    </div>
  );

  return (
    <div className="performance-panel">
      {!loading && points.length === 0 && transactions.length === 0 ? (
        <div className="performance-card performance-empty">
          <p>{error ? "성과 조회 실패" : "성과 기록 없음"}</p>
          {error && <p role="alert" className="performance-notice text-cf-negative">{error}</p>}
        </div>
      ) : (
        <div className="performance-card" aria-busy={loading}>
          <div className="performance-period">
            <PerformanceDateControls
              range={range} firstDate={firstDate} lastDate={lastDate}
              startDate={effectiveStart} endDate={effectiveEnd}
              onRangeChange={setRange}
              onDatesChange={(start, end) => {
                setCustomStart(start);
                setCustomEnd(end);
                setRange("custom");
              }}
            />
            <div className="performance-controls">
              <div className="performance-modes" role="group" aria-label="차트 종류">
                <button type="button" className="performance-choice" aria-pressed={chartMode === "assets"} onClick={() => setChartMode("assets")}>보유자산 추이</button>
                <button type="button" className="performance-choice" aria-pressed={chartMode === "return"} onClick={() => setChartMode("return")}>수익률 비교</button>
              </div>
            </div>
          </div>

          {!intradayRange && refreshError && <p
            role={showingPrevious ? "status" : "alert"}
            className={cn("performance-notice", showingPrevious ? "text-cf-muted" : "text-cf-negative")}
          >{showingPrevious ? "갱신하지 못해 이전 결과를 표시합니다." : refreshError}</p>}
          {intradayRange ? <IntradayAnalytics range={intradayRange} currency={displayCurrency} mode={chartMode}
            selected={selected} focusedSymbol={focusedSymbol} renderComparisons={renderComparisonPanel} /> : loadingInitial ? (
            <div className="performance-empty" role="status">
              <Loader2 className="performance-spinner" aria-hidden="true" /> 성과 불러오는 중
            </div>
          ) : unresolvedView ? (
            <div className="performance-empty"><p>성과 조회 실패</p></div>
          ) : <>
            <div className="performance-chart-section">
              <div className="performance-toolbar">
                <PerformanceSummary
                  profitKRW={metrics.profitKRW}
                  inactive={entirelyInactive}
                />
                <div className="performance-chart-meta">
                  <div className="performance-legend" aria-label="차트 범례">
                    {inactivePeriods.length > 0 && <span><i className="performance-inactive-key" aria-hidden="true" />미보유 기간</span>}
                  </div>
                  <span className="performance-currency">
                    {chartMode === "return" ? "내 수익률 KRW 기준" : `단위: ${getAssetAxis(assetData, assetCurrency).unitLabel}${assetCurrency === "USD" ? " · 현재 환율 환산" : ""}`}
                  </span>
                </div>
              </div>
              {chartMode === "assets" && displayCurrency === "USD" && assetCurrency === "KRW" && <p role="status" className="performance-notice text-cf-warning">달러 환율 확인 필요 · 원화로 표시</p>}
              <div className="performance-chart" role="region" aria-label={chartMode === "assets" ? "보유자산 추이 그래프" : "수익률 비교 그래프"}>
                {chartMode === "return" ? (
                  <ReturnChart data={chartData} inactivePeriods={inactivePeriods} comparisons={comparisonLines} activeKey={activeKey} />
                ) : (
                  <AssetChart data={assetData} inactivePeriods={inactivePeriods} currency={assetCurrency} />
                )}
              </div>
              {chartMode === "return" && renderComparisonPanel([
                  { ...PORTFOLIO_LINE, value: normalizedPoints.at(-1)?.portfolioReturn ?? null,
                    detail: entirelyInactive ? "미운용" : metrics.securitiesReturn == null ? "수익률 계산 불가" : "" },
                  ...comparisonLines.map((item) => ({ ...item,
                    fullName: selected.find((choice) => choice.symbol === item.symbol)?.name,
                    value: chartData.at(-1)?.[item.key] ?? null,
                    detail: item.status === "ready" ? item.dividendLabel : item.status === "loading" ? "불러오는 중"
                      : item.status === "missing-start" ? "시작일 시세 없음 · 기간을 줄여 주세요" : "조회 실패",
                  })),
                ], activeKey, retry)}
            </div>
          </>}
          {!intradayRange && error && !refreshError && <p role="alert" className="performance-error">{error}</p>}
        </div>
      )}
    </div>
  );
}
