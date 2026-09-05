"use client";

import { formatCurrency } from "@/lib/format";
import { getChart } from "@/lib/stock-api";
import type { ChartPoint } from "@/lib/types";
import { Loader2,RefreshCw } from "lucide-react";
import { useEffect,useId,useState } from "react";
import {
Area,
AreaChart,
CartesianGrid,
ResponsiveContainer,
Tooltip,
XAxis,
YAxis,
} from "recharts";

const RANGES = [
  { label: "1주", value: "5d" },
  { label: "1개월", value: "1mo" },
  { label: "3개월", value: "3mo" },
  { label: "6개월", value: "6mo" },
  { label: "1년", value: "1y" },
  { label: "5년", value: "5y" },
];

export function StockChart({
  symbol,
  currency,
}: {
  symbol: string;
  currency: string;
}) {
  const chartCurrency = (value: number) => currency ? formatCurrency(value,currency) : value.toLocaleString("ko-KR");
  const [range, setRange] = useState("6mo");
  const [data, setData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const gradientId = useId().replace(/:/g, "");

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(false);
      try {
        const points = await getChart(symbol, range, controller.signal);
        if (!cancelled) setData(points);
      } catch {
        if (!cancelled) {
          setData([]);
          setError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 0);
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [symbol, range, retry]);

  const isUp = data.length >= 2 && data[data.length - 1].close >= data[0].close;
  const color = isUp ? "#16856b" : "#d65353";
  const periodChange =
    data.length >= 2 && data[0].close > 0
      ? (data[data.length - 1].close / data[0].close - 1) * 100
      : null;

  return (
    <section className="rounded-2xl border border-[#e9eaed] bg-[#ffffff] p-4 sm:p-7">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-base font-semibold text-[#202329]">주가 추이</h2>
          <p className="mt-1.5 text-xs text-[#727680]">
            기간 내 종가 추이{" "}
            {periodChange != null && !loading && (
              <span className="ml-2 font-medium" style={{ color }}>
                {periodChange >= 0 ? "+" : ""}
                {periodChange.toFixed(2)}%
              </span>
            )}
          </p>
        </div>
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-[#f6f7f8] p-1">
          {RANGES.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={range === item.value}
              onClick={() => {
                if (range !== item.value) {
                  setLoading(true);
                  setRange(item.value);
                }
              }}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs transition ${range === item.value ? "bg-[#202329] font-semibold text-[#ffffff] shadow-sm" : "text-[#727680] hover:text-[#3b8879]"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div
          role="status"
          className="flex h-72 items-center justify-center text-sm text-[#727680]"
        >
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          차트를 가져오고 있어요
        </div>
      ) : data.length === 0 ? (
        <div className="flex h-72 flex-col items-center justify-center gap-3 text-sm text-[#727680]">
          <p>
            {error
              ? "차트를 불러오지 못했어요."
              : "이 기간의 차트 데이터가 없어요."}
          </p>
          <button
            type="button"
            onClick={() => setRetry((value) => value + 1)}
            className="flex items-center gap-1.5 text-xs font-medium text-[#3b8879]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            다시 불러오기
          </button>
        </div>
      ) : (
        <div
          role="img"
          aria-label={`${symbol} ${RANGES.find((item) => item.value === range)?.label} 종가 추이, ${periodChange?.toFixed(2)}% 변동`}
        >
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart
              data={data}
              margin={{ top: 10, right: 6, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b8879" stopOpacity={0.13} />
                  <stop offset="100%" stopColor="#3b8879" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid
                vertical={false}
                stroke="#e9eaed"
                strokeDasharray="4 4"
              />
              <XAxis
                dataKey="date"
                tick={{ fill: "#727680", fontSize: 11 }}
                tickFormatter={(value: string) =>
                  range === "5y" ? value.slice(0, 7) : value.slice(5)
                }
                minTickGap={42}
                axisLine={false}
                tickLine={false}
                dy={10}
              />
              <YAxis
                orientation="right"
                tick={{ fill: "#727680", fontSize: 11 }}
                tickFormatter={(value: number) =>
                  value.toLocaleString("ko-KR", { maximumFractionDigits: 0 })
                }
                domain={["auto", "auto"]}
                axisLine={false}
                tickLine={false}
                width={65}
              />
              <Tooltip
                cursor={{ stroke: "#c1d7d0", strokeDasharray: "4 3" }}
                contentStyle={{
                  background: "#ffffff",
                  border: "1px solid #e9eaed",
                  borderRadius: "12px",
                  color: "#202329",
                  boxShadow: "0 8px 28px #2023290d",
                  fontSize: "12px",
                }}
                formatter={(value) => [
                  chartCurrency(Number(value)),
                  "종가",
                ]}
              />
              <Area
                type="monotone"
                dataKey="close"
                stroke="#3b8879"
                fill={`url(#${gradientId})`}
                strokeWidth={2.2}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
