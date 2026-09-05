"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CalendarRange,
  Check,
  ChevronDown,
  Loader2,
  Search,
  TrendingUp,
  X,
} from "lucide-react";
import { usePerformanceHistory } from "@/hooks/usePerformanceHistory";
import { usePortfolio } from "@/hooks/usePortfolio";
import {
  addCalendarDays,
  calculatePerformanceMetrics,
  findInactivePeriods,
  normalizePerformancePoints,
} from "@/lib/performance";
import { formatCurrency, formatPercent } from "@/lib/format";
import { getChartSeries, searchStocks } from "@/lib/stock-api";
import type { ChartSeries, StockSearchResult } from "@/lib/types";
import { cn } from "@/lib/utils";

const RANGES = [
  { key: "1d", label: "1일", days: 1 },
  { key: "1w", label: "1주", days: 7 },
  { key: "1m", label: "1개월", days: 30 },
  { key: "3m", label: "3개월", days: 90 },
  { key: "6m", label: "6개월", days: 180 },
  { key: "ytd", label: "올해" },
  { key: "1y", label: "1년", days: 365 },
  { key: "all", label: "전체" },
] as const;

type RangeKey = (typeof RANGES)[number]["key"] | "custom";
type ChartMode = "return" | "assets";

export function PerformanceAnalytics() {
  const { transactions } = usePortfolio();
  const { points, trackingStartedAt, loading, error } = usePerformanceHistory();
  const [range, setRange] = useState<RangeKey>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [chartMode, setChartMode] = useState<ChartMode>("return");
  const [datePanelOpen, setDatePanelOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [benchmark, setBenchmark] = useState<StockSearchResult | null>(null);
  const [benchmarkSeries, setBenchmarkSeries] = useState<ChartSeries | null>(
    null,
  );
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);

  const firstDate = points[0]?.date ?? "";
  const lastDate = points.at(-1)?.date ?? "";
  const effectiveEnd = range === "custom" && customEnd ? customEnd : lastDate;
  const effectiveStart = useMemo(() => {
    if (!firstDate || !effectiveEnd) return "";
    if (range === "custom" && customStart) {
      return customStart < firstDate ? firstDate : customStart;
    }
    if (range === "all") return firstDate;
    if (range === "ytd") {
      const ytd = `${effectiveEnd.slice(0, 4)}-01-01`;
      return ytd < firstDate ? firstDate : ytd;
    }
    const definition = RANGES.find((item) => item.key === range);
    const candidate =
      definition && "days" in definition
        ? addCalendarDays(effectiveEnd, -definition.days)
        : firstDate;
    return candidate < firstDate ? firstDate : candidate;
  }, [customStart, effectiveEnd, firstDate, range]);

  const selectedPoints = useMemo(
    () =>
      points.filter(
        (point) => point.date >= effectiveStart && point.date <= effectiveEnd,
      ),
    [effectiveEnd, effectiveStart, points],
  );
  const normalizedPoints = useMemo(
    () => normalizePerformancePoints(selectedPoints),
    [selectedPoints],
  );
  const metrics = useMemo(
    () =>
      calculatePerformanceMetrics(
        points,
        transactions,
        effectiveStart,
        effectiveEnd,
      ),
    [effectiveEnd, effectiveStart, points, transactions],
  );
  const inactivePeriods = useMemo(
    () => findInactivePeriods(selectedPoints),
    [selectedPoints],
  );
  const entirelyInactive =
    selectedPoints.length > 0 && selectedPoints.every((point) => !point.active);

  useEffect(() => {
    if (!query.trim() || benchmark?.name === query) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearching(true);
      searchStocks(query)
        .then((results) => {
          if (!cancelled) setSearchResults(results);
        })
        .catch(() => {
          if (!cancelled) setSearchResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [benchmark?.name, query]);

  useEffect(() => {
    if (!benchmark || !effectiveStart || !effectiveEnd) {
      return;
    }

    let cancelled = false;
    getChartSeries(
      benchmark.symbol,
      addCalendarDays(effectiveStart, -7),
      effectiveEnd,
    )
      .then((series) => {
        if (!cancelled) setBenchmarkSeries(series);
      })
      .catch(() => {
        if (!cancelled) setBenchmarkSeries(null);
      })
      .finally(() => {
        if (!cancelled) setBenchmarkLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [benchmark, effectiveEnd, effectiveStart]);

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
      <section className="rounded-2xl border border-[#e3eae1] bg-white px-5 py-16 text-center sm:px-7">
        <CalendarRange className="mx-auto h-6 w-6 text-[#4f7e5a]" />
        <h2 className="mt-4 font-semibold text-[#263d2e]">
          첫 거래부터 기록을 시작합니다
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#7c8c76]">
          거래를 하나 등록하면 생성 시각부터 오늘까지의 일별 자산과 수익률을
          만듭니다.
        </p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[#e3eae1] bg-white ">
      <div className="border-b border-[#e3eae1] px-5 py-5 sm:px-7">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[#263d2e]">
              <TrendingUp className="h-4 w-4 text-[#4f7e5a]" />내 성과 기록
            </div>
            <p className="mt-1 text-xs text-[#7c8c76]">
              전체 {trackingLabel} · 매일 23:59:59 KST 기준
            </p>
          </div>

          <div className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-[#f4f7f1] p-1">
            {RANGES.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setRange(item.key)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  range === item.key
                    ? "bg-white text-slate-950"
                    : "text-[#7c8c76] hover:text-[#263d2e]",
                )}
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setDatePanelOpen((open) => !open)}
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                range === "custom"
                  ? "bg-white text-slate-950"
                  : "text-[#7c8c76] hover:text-[#263d2e]",
              )}
            >
              직접 선택 <ChevronDown className="h-3 w-3" />
            </button>
          </div>
        </div>

        {datePanelOpen && firstDate && lastDate && (
          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-[#e3eae1] bg-[#f7f9f4] p-4 sm:flex-row sm:items-end">
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
              className="flex h-10 items-center justify-center gap-1 rounded-xl bg-white px-4 text-sm font-semibold text-slate-950"
            >
              <Check className="h-4 w-4" /> 적용
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-px bg-[#edf2e9] sm:grid-cols-3">
        <MetricCard
          label="운용수익률"
          value={
            entirelyInactive
              ? "미운용"
              : formatOptionalPercent(metrics.operatingReturn)
          }
          description="입출금 영향을 제거한 비교용 성과"
        />
        <MetricCard
          label="내 자금수익률"
          value={formatOptionalPercent(metrics.moneyWeightedReturn)}
          description="투입한 금액과 기간을 함께 반영"
        />
        <MetricCard
          label="선택 기간 손익"
          value={formatCurrency(metrics.profitKRW, "KRW")}
          description={`${formatCurrency(metrics.startValueKRW, "KRW")} → ${formatCurrency(metrics.endValueKRW, "KRW")}`}
        />
      </div>

      <div className="p-5 sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex rounded-full bg-[#f4f7f1] p-1">
            <button
              type="button"
              onClick={() => setChartMode("return")}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium",
                chartMode === "return"
                  ? "bg-[#e9f1e2] text-[#406d4a]"
                  : "text-[#7c8c76]",
              )}
            >
              수익률 비교
            </button>
            <button
              type="button"
              onClick={() => setChartMode("assets")}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium",
                chartMode === "assets"
                  ? "bg-[#e9f1e2] text-[#406d4a]"
                  : "text-[#7c8c76]",
              )}
            >
              자산 추이
            </button>
          </div>

          <div className="relative w-full lg:w-80">
            {benchmark ? (
              <div className="flex h-10 items-center justify-between rounded-xl border border-[#d4e2ca] bg-[#f1f6ea] px-3">
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-[#406d4a]">
                    {benchmark.symbol}
                  </span>
                  <span className="ml-2 truncate text-xs text-[#7c8c76]">
                    {benchmark.name}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setBenchmark(null);
                    setBenchmarkSeries(null);
                    setQuery("");
                  }}
                  className="rounded-md p-1 text-[#7c8c76] hover:text-[#263d2e]"
                  aria-label="비교 자산 제거"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <>
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#82917b]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="비교할 주식·ETF·지수 검색"
                  className="h-10 w-full rounded-xl border border-[#e3eae1] bg-[#f9fbf7] pl-9 pr-9 text-sm text-[#263d2e] outline-none placeholder:text-[#82917b] focus:border-[#9ab78c]"
                />
                {searching && (
                  <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#7c8c76]" />
                )}
                {searchResults.length > 0 && (
                  <div className="absolute right-0 top-12 z-20 max-h-64 w-full overflow-y-auto rounded-2xl border border-[#e3eae1] bg-white p-1 shadow-2xl">
                    {searchResults.map((result) => (
                      <button
                        key={`${result.symbol}-${result.exchange}`}
                        type="button"
                        onClick={() => {
                          setBenchmark(result);
                          setBenchmarkLoading(true);
                          setQuery(result.name);
                          setSearchResults([]);
                        }}
                        className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-[#f4f7f1]"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-[#263d2e]">
                            {result.symbol}
                          </span>
                          <span className="block truncate text-xs text-[#7c8c76]">
                            {result.name}
                          </span>
                        </span>
                        <span className="shrink-0 text-[10px] text-[#82917b]">
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
            <div className="flex h-full items-center justify-center text-sm text-[#7c8c76]">
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

        <div className="mt-4 flex flex-col gap-2 text-xs text-[#7c8c76] sm:flex-row sm:items-center sm:justify-between">
          <p>
            {inactivePeriods.length > 0
              ? "회색 구간은 자산이 0원이었던 미운용 기간입니다. 자산선은 0원, 수익률선은 고정됩니다."
              : "거래 이력과 일별 종가를 기준으로 매일의 투자자산을 재구성합니다."}
          </p>
          <p className="shrink-0">
            {benchmarkLoading
              ? "비교 자료 확인 중"
              : benchmarkSeries
                ? dividendLabel(benchmarkSeries)
                : "비교 자산을 검색해 추가할 수 있습니다"}
          </p>
        </div>
        {error && <p className="mt-3 text-xs text-amber-700">{error}</p>}
      </div>
    </section>
  );
}

function ReturnChart({
  data,
  inactivePeriods,
  benchmarkName,
}: {
  data: Array<Record<string, unknown>>;
  inactivePeriods: Array<{ start: string; end: string }>;
  benchmarkName?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={data}
        margin={{ top: 8, right: 8, bottom: 0, left: -12 }}
      >
        <CartesianGrid vertical={false} stroke="#edf1e8" />
        <XAxis
          dataKey="date"
          tickFormatter={shortDate}
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          minTickGap={28}
        />
        <YAxis
          tickFormatter={percentAxis}
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          width={58}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelFormatter={(value) => longDate(String(value ?? ""))}
          formatter={(value, name) => [
            formatPercent(Number(value)),
            name === "portfolioReturn"
              ? "내 포트폴리오"
              : (benchmarkName ?? "비교 자산"),
          ]}
        />
        {inactivePeriods.map((period) => (
          <ReferenceArea
            key={`${period.start}-${period.end}`}
            x1={period.start}
            x2={period.end}
            fill="#94a3b8"
            fillOpacity={0.06}
          />
        ))}
        <Line
          type="monotone"
          dataKey="portfolioReturn"
          stroke="#579263"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4 }}
        />
        {benchmarkName && (
          <Line
            type="monotone"
            dataKey="benchmarkReturn"
            stroke="#c1ab70"
            strokeWidth={1.8}
            strokeDasharray="5 4"
            dot={false}
            connectNulls
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

function AssetChart({
  data,
  inactivePeriods,
}: {
  data: Array<Record<string, unknown>>;
  inactivePeriods: Array<{ start: string; end: string }>;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 2 }}>
        <defs>
          <linearGradient id="asset-history-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#579263" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#579263" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#edf1e8" />
        <XAxis
          dataKey="date"
          tickFormatter={shortDate}
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          minTickGap={28}
        />
        <YAxis
          tickFormatter={(value) => compactKRW(Number(value))}
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          width={58}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelFormatter={(value) => longDate(String(value ?? ""))}
          formatter={(value) => [
            formatCurrency(Number(value), "KRW"),
            "총 투자자산",
          ]}
        />
        {inactivePeriods.map((period) => (
          <ReferenceArea
            key={`${period.start}-${period.end}`}
            x1={period.start}
            x2={period.end}
            fill="#94a3b8"
            fillOpacity={0.06}
          />
        ))}
        <Area
          type="monotone"
          dataKey="assetValueKRW"
          stroke="#579263"
          strokeWidth={2.5}
          fill="url(#asset-history-fill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function MetricCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="bg-white px-5 py-4 sm:px-7">
      <p className="text-xs text-[#7c8c76]">{label}</p>
      <p className="mt-1.5 text-lg font-semibold tracking-tight text-[#263d2e]">
        {value}
      </p>
      <p className="mt-1 text-[11px] text-[#82917b]">{description}</p>
    </div>
  );
}

function DateField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min: string;
  max: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex-1">
      <span className="mb-1.5 block text-xs text-[#7c8c76]">{label}</span>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-xl border border-[#e3eae1] bg-[#f9fbf7] px-3 text-sm text-[#263d2e] outline-none focus:border-[#9ab78c]"
      />
    </label>
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

function shortDate(value: string): string {
  return value.slice(5).replace("-", ".");
}

function longDate(value: string): string {
  return value.replaceAll("-", ".");
}

function compactKRW(value: number): string {
  if (Math.abs(value) >= 100_000_000)
    return `${(value / 100_000_000).toFixed(1)}억`;
  if (Math.abs(value) >= 10_000) return `${(value / 10_000).toFixed(0)}만`;
  return `${Math.round(value)}`;
}

function percentAxis(value: number): string {
  const normalized = Math.abs(value) < 0.005 ? 0 : value;
  const digits = Math.abs(normalized) < 10 ? 2 : 0;
  return `${normalized.toFixed(digits)}%`;
}

const axisTick = { fill: "#64748b", fontSize: 11 };
const tooltipStyle = {
  background: "#ffffff",
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: "12px",
  color: "#40583c",
};
