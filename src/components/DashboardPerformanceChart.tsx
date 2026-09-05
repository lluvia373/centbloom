"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Loader2 } from "lucide-react";
import { usePerformanceHistory } from "@/hooks/usePerformanceHistory";
import {
  addCalendarDays,
  normalizePerformancePoints,
} from "@/lib/performance";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

const RANGES = [
  { key: "1d", label: "1일", days: 1 },
  { key: "1w", label: "1주", days: 7 },
  { key: "1m", label: "1개월", days: 30 },
  { key: "3m", label: "3개월", days: 90 },
  { key: "6m", label: "6개월", days: 180 },
  { key: "1y", label: "1년", days: 365 },
  { key: "all", label: "전체" },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

export function DashboardPerformanceChart() {
  const { points, trackingStartedAt, loading, error } = usePerformanceHistory();
  const [range, setRange] = useState<RangeKey>("all");
  const selectedRangeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    selectedRangeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [range]);

  const firstDate = points[0]?.date ?? "";
  const lastDate = points.at(-1)?.date ?? "";
  const effectiveStart = useMemo(() => {
    if (!firstDate || !lastDate || range === "all") return firstDate;
    const definition = RANGES.find((item) => item.key === range);
    const candidate =
      definition && "days" in definition
        ? addCalendarDays(lastDate, -definition.days)
        : firstDate;
    return candidate < firstDate ? firstDate : candidate;
  }, [firstDate, lastDate, range]);

  const chartData = useMemo(() => {
    const selected = points.filter((point) => point.date >= effectiveStart);
    return normalizePerformancePoints(selected);
  }, [effectiveStart, points]);

  const currentReturn = chartData.at(-1)?.portfolioReturn ?? 0;
  const chartDomain = useMemo(() => {
    const values = chartData.map((point) => point.portfolioReturn);
    if (values.length === 0) return [-0.25, 0.25];
    const minimum = Math.min(...values, 0);
    const maximum = Math.max(...values, 0);
    const padding = Math.max((maximum - minimum) * 0.2, 0.25);
    return [minimum - padding, maximum + padding];
  }, [chartData]);

  if (loading && points.length === 0) {
    return (
      <div className="flex h-44 items-center justify-center text-xs text-[#727680] sm:h-48">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 성과 기록을 불러오는 중
      </div>
    );
  }

  if (points.length === 0) {
    return (
      <div className="flex h-44 items-center justify-center rounded-2xl bg-[#202329]/[0.04] px-6 text-center text-xs leading-5 text-[#727680] sm:h-48">
        첫 거래를 등록하면 포트폴리오를 만든 날부터 성과 그래프가 시작됩니다.
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-medium text-[#727680]">운용수익률 · {rangeLabel(range)}</p>
          <p className={cn("mt-1 text-base font-semibold", currentReturn >= 0 ? "text-[#16856b]" : "text-[#d65353]")}>
            {formatPercent(currentReturn)}
          </p>
        </div>

        <div className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-[#f6f7f8] p-1" aria-label="성과 조회 기간">
          {RANGES.map((item) => (
            <button
              key={item.key}
              ref={range === item.key ? selectedRangeRef : undefined}
              type="button"
              onClick={() => setRange(item.key)}
              aria-pressed={range === item.key}
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1.5 text-[11px] font-medium transition-colors sm:px-3",
                range === item.key
                  ? "bg-[#202329] text-[#ffffff]"
                  : "text-[#727680] hover:text-[#202329]"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 h-36 sm:h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid vertical={false} stroke="#edf0f2" />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              tick={{ fill: "#727680", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              minTickGap={48}
            />
            <YAxis hide domain={chartDomain} />
            <ReferenceLine y={0} stroke="#d8dcdf" strokeDasharray="4 4" />
            <Tooltip
              cursor={{ stroke: "#c1d7d0", strokeWidth: 1 }}
              contentStyle={tooltipStyle}
              labelFormatter={(value) => String(value ?? "").replaceAll("-", ".")}
              formatter={(value) => [formatPercent(Number(value)), "운용수익률"]}
            />
            <Line
              type="monotone"
              dataKey="portfolioReturn"
              stroke="#3b8879"
              strokeWidth={2.5}
              dot={chartData.length === 1 ? { r: 4, fill: "#3b8879", strokeWidth: 0 } : false}
              activeDot={{ r: 4, fill: "#ffffff", stroke: "#3b8879", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-[#727680]">
        <span>{trackingStartedAt ? `기록 시작 ${longDate(firstDate)}` : longDate(firstDate)}</span>
        <span>{chartData.length === 1 ? "첫 기록" : `${chartData.length}일 기록`}</span>
      </div>
      {error && <p className="mt-2 text-[11px] text-[#946a24]">{error}</p>}
    </div>
  );
}

function rangeLabel(range: RangeKey): string {
  return RANGES.find((item) => item.key === range)?.label ?? "전체";
}

function shortDate(value: string): string {
  return value.slice(5).replace("-", ".");
}

function longDate(value: string): string {
  return value.replaceAll("-", ".");
}

const tooltipStyle = {
  background: "#ffffff",
  border: "1px solid #e9eaed",
  borderRadius: "12px",
  color: "#202329",
  fontSize: "12px",
};
