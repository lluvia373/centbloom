"use client";
import { useId, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartNoAxesCombined, Info, Loader2 } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { usePortfolio } from "@/hooks/usePortfolio";
import { usePerformanceHistory } from "@/hooks/usePerformanceHistory";
import { DEMO_FX, demoHistory } from "@/lib/demo";
import { formatCurrency } from "@/lib/format";
import { addCalendarDays } from "@/lib/performance";

interface WealthPoint {
  date: string;
  value: number;
  cost: number;
  return: number;
}
const sampleHistory = demoHistory();
const ranges = [
  { key: "1w", label: "1주", days: 7 },
  { key: "1m", label: "1개월", days: 30 },
  { key: "3m", label: "3개월", days: 90 },
  { key: "6m", label: "6개월", days: 180 },
  { key: "all", label: "전체", days: 0 },
];

export function WealthChart({ expanded = false }: { expanded?: boolean }) {
  const { isDemo } = useWorkspace();
  return isDemo ? (
    <ChartView points={sampleHistory} demo expanded={expanded} />
  ) : (
    <RealChart expanded={expanded} />
  );
}
function RealChart({ expanded }: { expanded: boolean }) {
  const { points, loading, error } = usePerformanceHistory();
  const data = useMemo(
    () =>
      points.map((point) => ({
        date: point.date,
        value: point.assetValueKRW,
        cost: point.cumulativeNetFlowKRW,
        return: point.twrIndex - 100,
      })),
    [points],
  );
  return (
    <ChartView
      points={data}
      loading={loading}
      error={error}
      expanded={expanded}
    />
  );
}
function ChartView({
  points,
  demo = false,
  loading = false,
  error,
  expanded = false,
}: {
  points: WealthPoint[];
  demo?: boolean;
  loading?: boolean;
  error?: string | null;
  expanded?: boolean;
}) {
  const { displayCurrency } = usePortfolio();
  const { summary } = useWorkspace();
  const [range, setRange] = useState("6m");
  const [mode, setMode] = useState("assets");
  const gradientId = useId().replace(/:/g, "");
  const fx = demo
    ? DEMO_FX
    : summary?.holdings.find((h) => h.currency === "USD")?.currentFxRateToKRW;
  const showUSD = displayCurrency === "USD" && Boolean(fx);
  const currency = showUSD ? "USD" : "KRW";
  const lastDate = points.at(-1)?.date;
  const days = ranges.find((item) => item.key === range)?.days ?? 0;
  const filtered = points.filter(
    (point) =>
      !days || !lastDate || point.date >= addCalendarDays(lastDate, -days),
  );
  const firstReturn = filtered[0]?.return ?? 0;
  const data = filtered.map((point) => ({
    ...point,
    value: point.value / (showUSD ? fx! : 1),
    cost: point.cost / (showUSD ? fx! : 1),
    return: ((1 + point.return / 100) / (1 + firstReturn / 100) - 1) * 100,
  }));
  const valueKey = mode === "assets" ? "value" : "return";
  return (
    <section className="surface">
      <div className="surface-header">
        <div>
          <h2>{mode === "assets" ? "자산의 흐름" : "수익률의 흐름"}</h2>
          <p>
            {mode === "assets"
              ? "시간이 쌓이면, 자산도 달라집니다."
              : "자금 유입과 유출을 제외한 운용 성과"}
          </p>
        </div>
        <select
          aria-label="차트 표시 기준"
          value={mode}
          onChange={(event) => setMode(event.target.value)}
        >
          <option value="assets">투자자산</option>
          <option value="return">운용수익률</option>
        </select>
      </div>
      <div className="chart-toolbar">
        <div className="chart-legend">
          <span>
            <i />
            {mode === "assets" ? "평가액" : "운용수익률"}
          </span>
          {mode === "assets" && (
            <span>
              <i className="cost" />
              누적 순투입금
            </span>
          )}
        </div>
        <div className="range-control" role="group" aria-label="차트 조회 기간">
          {ranges.map((item) => (
            <button
              key={item.key}
              onClick={() => setRange(item.key)}
              className={range === item.key ? "selected" : ""}
              aria-pressed={range === item.key}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {data.length > 0 ? (
        <div
          className="wealth-chart"
          style={expanded ? { height: 320 } : undefined}
          role="img"
          aria-label={`${data[0].date}부터 ${data.at(-1)?.date}까지 ${mode === "assets" ? "투자자산" : "운용수익률"} 차트`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              margin={{ top: 15, right: 16, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#adcba0" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="#eaf2e5" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid
                vertical={false}
                stroke="#edf1e9"
                strokeDasharray="3 5"
              />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                minTickGap={42}
                tickMargin={13}
                tick={{ fill: "#65745f", fontSize: 9 }}
                tickFormatter={(date) =>
                  `${Number(date.slice(5, 7))}.${date.slice(8)}`
                }
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tickMargin={8}
                width={49}
                tick={{ fill: "#65745f", fontSize: 9 }}
                domain={["auto", "auto"]}
                tickFormatter={(value) =>
                  mode === "return"
                    ? `${Math.abs(value) < 0.005 ? "0" : value.toFixed(Math.abs(value) < 1 ? 2 : 1)}%`
                    : currency === "USD"
                      ? `$${(value / 1000).toFixed(0)}k`
                      : `${(value / 10000).toLocaleString("ko-KR", { maximumFractionDigits: 0 })}만`
                }
              />
              <Tooltip
                cursor={{ stroke: "#aac39c", strokeDasharray: "4 3" }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <div className="chart-tooltip">
                      <p>
                        {String(label).replaceAll("-", ". ")}
                        {demo ? " · 샘플" : ""}
                      </p>
                      <strong>
                        {mode === "assets"
                          ? formatCurrency(
                              Number(
                                payload.find((p) => p.dataKey === "value")
                                  ?.value ?? 0,
                              ),
                              currency,
                            )
                          : `${Number(payload[0].value).toFixed(2)}%`}
                      </strong>
                      {mode === "assets" && (
                        <small>
                          순투입금{" "}
                          {formatCurrency(
                            Number(payload[0].payload.cost),
                            currency,
                          )}
                        </small>
                      )}
                    </div>
                  ) : null
                }
              />
              {mode === "assets" && (
                <Line
                  type="monotone"
                  dataKey="cost"
                  stroke="#bdcbb2"
                  strokeDasharray="4 4"
                  strokeWidth={1.3}
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
              )}
              <Area
                type="monotone"
                dataKey={valueKey}
                stroke="#4e895e"
                strokeWidth={2.2}
                fill={`url(#${gradientId})`}
                activeDot={{
                  r: 5,
                  stroke: "#fff",
                  strokeWidth: 3,
                  fill: "#4e895e",
                }}
                dot={data.length === 1 ? { r: 4 } : false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="empty-chart">
          {loading ? (
            <Loader2 className="animate-spin" size={26} />
          ) : (
            <ChartNoAxesCombined size={30} />
          )}
          <strong>
            {loading ? "자산 기록을 불러오고 있어요" : "나의 투자가 쌓이는 곳"}
          </strong>
          <p>{error ?? "첫 거래부터 나만의 자산 그래프가 시작됩니다."}</p>
        </div>
      )}
      <p className="chart-footnote">
        <Info size={11} />
        {demo
          ? "체험용 예시 데이터 · 수익률은 원화 기준, 달러 자산은 예시 환율 환산"
          : (error ??
            (mode === "return"
              ? "원화 기준 운용수익률 · 자금 유입과 유출의 영향을 제외합니다."
              : showUSD
                ? "일별 원화 기록을 현재 환율로 환산한 참고 금액입니다."
                : "매일 KST 기준 일별 투자자산 · 현금 잔액 미포함"))}
      </p>
    </section>
  );
}
