"use client";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { DisplayCurrency } from "@/lib/types";
import { useId, useState } from "react";
import { getAssetAxis, getChartDates, getReturnAxis } from "./chart-presentation";
import {
  Area,
  ComposedChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function longDate(value: string): string {
  return value.replaceAll("-", ".");
}

const axisTick = { fill: "var(--cf-color-muted)", fontSize: "var(--cf-text-caption)", fontFamily: "var(--cf-font-ui)" };
const tooltipStyle = {
  background: "var(--cf-color-surface)",
  border: "1px solid var(--cf-color-line)",
  borderRadius: "var(--cf-radius-card)",
  color: "var(--cf-color-ink)",
  boxShadow: "var(--cf-shadow-dialog)",
  fontSize: "var(--cf-text-label)",
  fontVariantNumeric: "tabular-nums",
  padding: "var(--cf-space-3) var(--cf-space-4)",
};

export function ReturnChart({
  data,
  inactivePeriods,
  benchmarkName,
}: {
  data: Array<Record<string, unknown>>;
  inactivePeriods: Array<{ start: string; end: string }>;
  benchmarkName?: string;
}) {
  const [width, setWidth] = useState(0);
  const dates = getChartDates(data, width);
  const axis = getReturnAxis(data);
  return (
    <ResponsiveContainer width="100%" height="100%" onResize={setWidth}>
      <LineChart
        data={data}
        margin={{ top: 12, right: 0, bottom: 0, left: 8 }}
      >
        <CartesianGrid vertical={false} stroke="var(--cf-color-line)" strokeOpacity={0.7} />
        <XAxis
          dataKey="date"
          ticks={dates.ticks}
          tickFormatter={dates.format}
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          minTickGap={24}
          interval="preserveStartEnd"
          tickMargin={12}
          height={36}
        />
        <YAxis
          ticks={axis.ticks}
          domain={axis.domain}
          tickFormatter={axis.format}
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          orientation="right"
          tickMargin={12}
          width={64}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ stroke: "var(--cf-color-focus)", strokeDasharray: "3 4", strokeOpacity: 0.6 }}
          labelFormatter={(value) => longDate(String(value ?? ""))}
          formatter={(value, name) => [
            formatPercent(Number(value)),
            name === "portfolioReturn"
              ? "내 수익률"
              : `${benchmarkName ?? "비교 자산"} 참고 수익률`,
          ]}
        />
        {inactivePeriods.map((period) => (
          <ReferenceArea
            key={`${period.start}-${period.end}`}
            x1={period.start}
            x2={period.end}
            fill="var(--cf-color-muted)"
            fillOpacity={0.06}
          />
        ))}
        <Line
          type="linear"
          dataKey="portfolioReturn"
          stroke="var(--cf-color-chart)"
          strokeWidth={2.5}
          dot={false}
          connectNulls={false}
          activeDot={{ r: 4, stroke: "var(--cf-color-surface)", strokeWidth: 2 }}
          isAnimationActive={false}
        />
        {benchmarkName && (
          <Line
            type="linear"
            dataKey="benchmarkReturn"
            stroke="var(--cf-color-muted)"
            strokeWidth={1.8}
            strokeDasharray="5 4"
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function AssetChart({
  data,
  inactivePeriods,
  currency = "KRW",
}: {
  data: Array<Record<string, unknown>>;
  inactivePeriods: Array<{ start: string; end: string }>;
  currency?: DisplayCurrency;
}) {
  const gradientId = useId().replace(/:/g, "");
  const [width, setWidth] = useState(0);
  const dates = getChartDates(data, width);
  const axis = getAssetAxis(data, currency);
  return (
    <ResponsiveContainer width="100%" height="100%" onResize={setWidth}>
      <ComposedChart data={data} margin={{ top: 12, right: 0, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--cf-color-chart)" stopOpacity={0.1} />
            <stop offset="100%" stopColor="var(--cf-color-chart)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--cf-color-line)" strokeOpacity={0.7} />
        <XAxis
          dataKey="date"
          ticks={dates.ticks}
          tickFormatter={dates.format}
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          minTickGap={24}
          interval="preserveStartEnd"
          tickMargin={12}
          height={36}
        />
        <YAxis
          ticks={axis.ticks}
          domain={axis.domain}
          tickFormatter={axis.format}
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          orientation="right"
          tickMargin={12}
          width={64}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ stroke: "var(--cf-color-focus)", strokeDasharray: "3 4", strokeOpacity: 0.6 }}
          labelFormatter={(value) => longDate(String(value ?? ""))}
          formatter={(value) => [
            formatCurrency(Number(value), currency),
            "보유자산",
          ]}
        />
        {inactivePeriods.map((period) => (
          <ReferenceArea
            key={`${period.start}-${period.end}`}
            x1={period.start}
            x2={period.end}
            fill="var(--cf-color-muted)"
            fillOpacity={0.06}
          />
        ))}
        <Area
          type="linear"
          dataKey="assetValue"
          stroke="var(--cf-color-chart)"
          strokeWidth={2.5}
          fill={`url(#${gradientId})`}
          dot={data.length === 1 ? { r: 4 } : false}
          activeDot={{ r: 4, stroke: "var(--cf-color-surface)", strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
