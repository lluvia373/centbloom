"use client";
import { formatCurrency, formatPercent } from "@/lib/format";
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

const axisTick = { fill: "#727680", fontSize: 11 };
const tooltipStyle = {
  background: "#ffffff",
  border: "1px solid #e9eaed",
  borderRadius: "12px",
  color: "#202329",
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
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={data}
        margin={{ top: 8, right: 8, bottom: 0, left: -12 }}
      >
        <CartesianGrid vertical={false} stroke="#e9eaed" />
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
            fill="#727680"
            fillOpacity={0.06}
          />
        ))}
        <Line
          type="monotone"
          dataKey="portfolioReturn"
          stroke="#3b8879"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4 }}
        />
        {benchmarkName && (
          <Line
            type="monotone"
            dataKey="benchmarkReturn"
            stroke="#727680"
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

export function AssetChart({
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
            <stop offset="0%" stopColor="#3b8879" stopOpacity={0.16} />
            <stop offset="100%" stopColor="#3b8879" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#e9eaed" />
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
            fill="#727680"
            fillOpacity={0.06}
          />
        ))}
        <Area
          type="monotone"
          dataKey="assetValueKRW"
          stroke="#3b8879"
          strokeWidth={2.5}
          fill="url(#asset-history-fill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
