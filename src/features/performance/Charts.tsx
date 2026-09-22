"use client";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { DisplayCurrency } from "@/lib/types";
import { useId, useMemo, useState } from "react";
import { getAssetAxis, getChartDates, getReturnAxis } from "./chart-presentation";
import {
  Area, ComposedChart, Line, LineChart, ReferenceArea, ReferenceDot,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

export interface ComparisonLine {
  key: string;
  name: string;
  color: string;
}
export const PORTFOLIO_LINE: ComparisonLine = {
  key: "portfolioReturn", name: "내 수익률", color: "var(--cf-color-chart)",
};
const NO_COMPARISONS: ComparisonLine[] = [];
const axisTick = { fill: "var(--cf-color-muted)", fontSize: "var(--cf-text-caption)", fontFamily: "var(--cf-font-ui)" };
const tooltipStyle = {
  background: "var(--cf-color-surface)", border: "1px solid var(--cf-color-line)",
  borderRadius: "var(--cf-radius-card)", color: "var(--cf-color-ink)",
  boxShadow: "var(--cf-shadow-dialog)", fontSize: "var(--cf-text-label)",
  fontVariantNumeric: "tabular-nums", padding: "var(--cf-space-3) var(--cf-space-4)",
};

function longDate(value: unknown): string {
  const date = typeof value === "number" ? new Date(value).toISOString().slice(0, 10) : String(value ?? "");
  return date.replaceAll("-", ".");
}
function YearBands({ dates, right }: { dates: ReturnType<typeof getChartDates>; right: number }) {
  const span = dates.domain[1] - dates.domain[0];
  return dates.yearBands.length > 0 ? <div className="performance-chart-years" style={{ left: 60, right }} aria-hidden="true">
    {dates.yearBands.map((band) => <span key={band.year} style={{
      left: `${(band.start - dates.domain[0]) / span * 100}%`,
      width: `${(band.end - band.start) / span * 100}%`,
    }}><span>{band.year}</span></span>)}
  </div> : null;
}

export function ReturnChart({ data, inactivePeriods, comparisons = NO_COMPARISONS, activeKey = null }: {
  data: Array<Record<string, unknown>>;
  inactivePeriods: Array<{ start: string; end: string }>;
  comparisons?: ComparisonLine[];
  activeKey?: string | null;
}) {
  const [size, setSize] = useState({ width: 0, height: 320 });
  const chartData = useMemo<Array<Record<string, unknown> & { timestamp: number }>>(
    () => data.map((point) => ({ ...point, timestamp: Date.parse(String(point.date)) })), [data],
  );
  const lines = [PORTFOLIO_LINE, ...comparisons];
  const showEndLabels = size.width >= 760 && comparisons.length <= 3;
  const right = showEndLabels ? 116 : 16;
  const dates = getChartDates(data, size.width - 60 - right);
  const axis = getReturnAxis(data, lines.map((line) => line.key));
  const axisHeight = dates.yearBands.length > 0 ? 60 : 36;
  const plotHeight = Math.max(1, size.height - 12 - axisHeight);
  const last = chartData.at(-1);
  const labels = lines.flatMap((line) => {
    const value = last?.[line.key];
    return typeof value === "number" && Number.isFinite(value)
      ? [{ ...line, value, y: 12 + (axis.domain[1] - value) / (axis.domain[1] - axis.domain[0]) * plotHeight }]
      : [];
  }).sort((a, b) => a.y - b.y);
  for (let i = 0; i < labels.length; i++) labels[i].y = Math.max(24, labels[i].y, i > 0 ? labels[i - 1].y + 38 : 0);
  for (let i = labels.length - 1; i >= 0; i--) labels[i].y = Math.min(12 + plotHeight - 16, labels[i].y, i < labels.length - 1 ? labels[i + 1].y - 38 : Infinity);
  return <div className="performance-chart-frame">
    <ResponsiveContainer width="100%" height="100%" onResize={(width, height) => setSize({ width, height })}>
      <LineChart data={chartData} margin={{ top: 12, right, bottom: 0, left: 0 }}>
        <XAxis dataKey="timestamp" type="number" scale="time" domain={dates.domain}
          ticks={dates.ticks} tickFormatter={dates.format} tick={axisTick} axisLine={false}
          tickLine={false} interval={0} tickMargin={12} height={axisHeight} />
        <YAxis ticks={axis.ticks} domain={axis.domain} tickFormatter={axis.format} tick={axisTick}
          axisLine={false} tickLine={false} tickMargin={12} width={60} />
        <ReferenceLine y={0} stroke="var(--cf-color-line)" />
        <Tooltip contentStyle={tooltipStyle} wrapperClassName="performance-chart-tooltip"
          cursor={{ stroke: "var(--cf-color-focus)", strokeOpacity: 0.4 }}
          labelFormatter={longDate}
          formatter={(value, name) => [formatPercent(Number(value)), name === "portfolioReturn"
            ? "내 수익률" : `${comparisons.find((line) => line.key === name)?.name ?? "비교 자산"} 참고 수익률`]} />
        {inactivePeriods.map((period) => <ReferenceArea key={`${period.start}-${period.end}`}
          x1={Date.parse(period.start)} x2={Date.parse(period.end)} fill="var(--cf-color-muted)" fillOpacity={0.06} />)}
        {[...lines].sort((a, b) => Number(a.key === activeKey) - Number(b.key === activeKey)).map((line) => <Line
          key={line.key} type="linear" dataKey={line.key} stroke={line.color}
          strokeWidth={activeKey === line.key ? 3 : 2.15}
          strokeOpacity={activeKey && activeKey !== line.key ? 0.22 : 1}
          dot={chartData.length === 1 ? { r: 3 } : false} connectNulls={false}
          activeDot={{ r: 4, stroke: "var(--cf-color-surface)", strokeWidth: 2 }}
          isAnimationActive={false} />)}
        {showEndLabels && last && labels.map((label) => <ReferenceDot key={label.key}
          x={last.timestamp} y={label.value} ifOverflow="visible"
          shape={({ cx = 0, cy = 0 }) => <g className="performance-end-label"
            opacity={activeKey && activeKey !== label.key ? 0.22 : 1}>
            <path d={`M${cx},${cy} L${cx + 8},${label.y} L${cx + 14},${label.y}`} fill="none" stroke={label.color} strokeOpacity={0.5} />
            <text x={cx + 20} y={label.y - 3} fill={label.color}>{label.name.length > 12 ? `${label.name.slice(0, 11)}…` : label.name}</text>
            <text x={cx + 20} y={label.y + 13} fill={label.color}>{formatPercent(label.value)}</text>
          </g>} />)}
      </LineChart>
    </ResponsiveContainer>
    <YearBands dates={dates} right={right} />
  </div>;
}

export function AssetChart({ data, inactivePeriods, currency = "KRW" }: {
  data: Array<Record<string, unknown>>;
  inactivePeriods: Array<{ start: string; end: string }>;
  currency?: DisplayCurrency;
}) {
  const gradientId = useId().replace(/:/g, "");
  const [width, setWidth] = useState(0);
  const chartData = useMemo(() => data.map((point) => ({ ...point, timestamp: Date.parse(String(point.date)) })), [data]);
  const dates = getChartDates(data, width - 76);
  const axis = getAssetAxis(data, currency);
  return <div className="performance-chart-frame">
    <ResponsiveContainer width="100%" height="100%" onResize={setWidth}>
      <ComposedChart data={chartData} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
        <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--cf-color-chart)" stopOpacity={0.1} />
          <stop offset="100%" stopColor="var(--cf-color-chart)" stopOpacity={0} />
        </linearGradient></defs>
        <XAxis dataKey="timestamp" type="number" scale="time" domain={dates.domain}
          ticks={dates.ticks} tickFormatter={dates.format} tick={axisTick} axisLine={false}
          tickLine={false} interval={0} tickMargin={12} height={dates.yearBands.length > 0 ? 60 : 36} />
        <YAxis ticks={axis.ticks} domain={axis.domain} tickFormatter={axis.format} tick={axisTick}
          axisLine={false} tickLine={false} tickMargin={12} width={60} />
        <ReferenceLine y={0} stroke="var(--cf-color-line)" />
        <Tooltip contentStyle={tooltipStyle} wrapperClassName="performance-chart-tooltip"
          cursor={{ stroke: "var(--cf-color-focus)", strokeOpacity: 0.4 }}
          labelFormatter={longDate} formatter={(value) => [formatCurrency(Number(value), currency), "보유자산"]} />
        {inactivePeriods.map((period) => <ReferenceArea key={`${period.start}-${period.end}`}
          x1={Date.parse(period.start)} x2={Date.parse(period.end)} fill="var(--cf-color-muted)" fillOpacity={0.06} />)}
        <Area type="linear" dataKey="assetValue" stroke="var(--cf-color-chart)" strokeWidth={2.15}
          fill={`url(#${gradientId})`} dot={data.length === 1 ? { r: 4 } : false} connectNulls={false}
          activeDot={{ r: 4, stroke: "var(--cf-color-surface)", strokeWidth: 2 }} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
    <YearBands dates={dates} right={16} />
  </div>;
}
