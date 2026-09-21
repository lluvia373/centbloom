"use client";

import { formatCurrency, formatPercent } from "@/lib/format";

export { DateField } from "./DateField";

export function PerformanceSummary({
  profitKRW,
  returnPercent,
  inactive = false,
}: {
  profitKRW: number;
  returnPercent: number | null;
  inactive?: boolean;
}) {
  const hasReturn = returnPercent != null && Number.isFinite(returnPercent);
  const returnLabel = inactive ? "미운용" : hasReturn ? formatPercent(returnPercent) : "수익률 계산 불가";
  return (
    <dl className="performance-metrics">
      <div>
        <dt>기간 손익<span className="performance-basis">원화 기준</span></dt>
        <dd className="performance-metric-value">
          <span className={`performance-metric-amount ${valueTone(profitKRW)}`}>
            {Number.isFinite(profitKRW) ? `${profitKRW > 0 ? "+" : ""}${formatCurrency(profitKRW, "KRW")}` : "계산 불가"}
          </span>
          <span className={`performance-metric-return ${inactive || !hasReturn ? "text-cf-muted" : valueTone(returnPercent)}`}>
            {hasReturn && !inactive && <span className="sr-only">기간 수익률 </span>}
            {returnLabel}
          </span>
        </dd>
      </div>
    </dl>
  );
}

function valueTone(value: number | null): string {
  if (value == null || !Number.isFinite(value) || value === 0) return "text-cf-ink";
  return value > 0 ? "text-cf-market-up" : "text-cf-market-down";
}
