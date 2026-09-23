"use client";

import { formatCurrency } from "@/lib/format";
import { CalendarDays } from "lucide-react";
import { useRef, useState } from "react";
import { DateField } from "./DateField";
import { RANGES, type RangeKey } from "./use-performance-range";

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

type PerformanceDateControlsProps = {
  range: RangeKey;
  firstDate: string;
  lastDate: string;
  startDate: string;
  endDate: string;
  onRangeChange: (range: RangeKey) => void;
  onDatesChange: (start: string, end: string) => void;
};

/** Date entry and the two-step picker only; data selection/calculation stays in usePerformanceRange. */
export function PerformanceDateControls({
  range, firstDate, lastDate, startDate, endDate, onRangeChange, onDatesChange,
}: PerformanceDateControlsProps) {
  const rangeButton = useRef<HTMLButtonElement>(null);
  const [rangeSelection, setRangeSelection] = useState<{ step: "start" } | { step: "end"; start: string } | null>(null);
  const dateReady = Boolean(firstDate && lastDate);
  const dismissRange = (restoreFocus: boolean) => {
    setRangeSelection(null);
    if (restoreFocus) rangeButton.current?.focus();
  };

  return (
    <>
      <div className="performance-ranges" role="group" aria-label="조회 기간">
        {RANGES.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={range === item.key}
            disabled={!dateReady}
            onClick={() => onRangeChange(item.key)}
            className="performance-choice"
          >{item.label}</button>
        ))}
      </div>
      {dateReady && <div className="performance-dates" role="group" aria-label="조회 날짜">
        <button ref={rangeButton} type="button" className="performance-date-trigger" aria-label="기간 선택" aria-haspopup="dialog" aria-expanded={rangeSelection !== null} onClick={() => setRangeSelection({ step: "start" })}>
          <CalendarDays className="performance-date-icon" aria-hidden="true" />
        </button>
        <DateField
          label="시작일"
          value={startDate}
          min={firstDate}
          max={endDate}
          rangeStart={startDate}
          rangeEnd={endDate}
          picker={rangeSelection?.step === "start" ? {
            value: startDate, min: firstDate, max: lastDate,
            onSelect: (start) => setRangeSelection({ step: "end", start }),
            onDismiss: dismissRange,
          } : undefined}
          onChange={(value) => {
            if (!value || value < firstDate || value > endDate) return;
            onDatesChange(value, endDate);
          }}
        />
        <span className="performance-date-separator" aria-hidden="true">–</span>
        <DateField
          label="종료일"
          value={endDate}
          min={startDate}
          max={lastDate}
          rangeStart={rangeSelection?.step === "end" ? rangeSelection.start : startDate}
          rangeEnd={rangeSelection?.step === "end" ? undefined : endDate}
          picker={rangeSelection?.step === "end" ? {
            value: rangeSelection.start, min: rangeSelection.start, max: lastDate,
            onSelect: (end) => {
              onDatesChange(rangeSelection.start, end);
              dismissRange(true);
            },
            onDismiss: dismissRange,
          } : undefined}
          onChange={(value) => {
            if (!value || value < startDate || value > lastDate) return;
            onDatesChange(startDate, value);
          }}
        />
      </div>}
    </>
  );
}
