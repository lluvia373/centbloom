"use client";

import { formatCurrency } from "@/lib/format";

export { DateField } from "./DateField";

export function PerformanceSummary({
  profitKRW,
  inactive = false,
}: {
  profitKRW: number;
  inactive?: boolean;
}) {
  return (
    <dl className="performance-metrics">
      <div>
        <dt>기간 손익<span className="performance-basis">원화 기준</span></dt>
        <dd className="performance-metric-value">
          <span className={`performance-metric-amount ${valueTone(profitKRW)}`}>
            {Number.isFinite(profitKRW) ? `${profitKRW > 0 ? "+" : ""}${formatCurrency(profitKRW, "KRW")}` : "계산 불가"}
          </span>
          {inactive && <span className="performance-metric-return text-cf-muted">미운용</span>}
        </dd>
      </div>
    </dl>
  );
}

function valueTone(value: number | null): string {
  if (value == null || !Number.isFinite(value) || value === 0) return "text-cf-ink";
  return value > 0 ? "text-cf-market-up" : "text-cf-market-down";
}
