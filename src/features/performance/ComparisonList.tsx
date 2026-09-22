"use client";
import { formatPercent } from "@/lib/format";
import { RotateCcw, X } from "lucide-react";
import { useId } from "react";
import type { ComparisonLine } from "./Charts";

export const MAX_COMPARISONS = 12;

interface ComparisonItem extends ComparisonLine {
  symbol?: string;
  fullName?: string;
  value: number | null;
  status?: "ready" | "loading" | "error" | "missing-start";
  detail: string;
}

export function ComparisonList({ items, activeKey, onFocus, onRemove, onRetry }: {
  items: ComparisonItem[];
  activeKey: string | null;
  onFocus: (key: string) => void;
  onRemove: (symbol: string) => void;
  onRetry: (symbol: string) => void;
}) {
  const descriptionId = useId();
  return <ul className="performance-comparisons" aria-label="수익률 비교 목록">
    {items.map((item) => <li key={item.symbol ?? item.key} data-selected={activeKey === item.key}>
      <button type="button" className="performance-comparison-focus" aria-label={`${item.name} 선 강조`}
        aria-describedby={item.fullName ? `${descriptionId}-${item.key}` : undefined}
        disabled={item.status != null && item.status !== "ready"}
        aria-pressed={activeKey === item.key} onClick={() => onFocus(item.key)}>
        <i className="performance-line-key" style={{ borderColor: item.color }} aria-hidden="true" />
        <span className="performance-comparison-name">{item.name}</span>
        <strong style={{ color: item.color }}>{item.value != null && Number.isFinite(item.value) ? formatPercent(item.value) : "—"}</strong>
      </button>
      {item.fullName && <span id={`${descriptionId}-${item.key}`} hidden>{item.fullName}</span>}
      {item.symbol && <button type="button" className="performance-remove" aria-label={`${item.symbol} 비교 제거`}
        onClick={() => onRemove(item.symbol!)}><X aria-hidden="true" /></button>}
      {item.detail && <span className="performance-comparison-detail" role={item.status === "error" ? "alert" : item.status === "loading" ? "status" : undefined}>
        {item.detail}
        {item.status === "error" && item.symbol && <button type="button" className="performance-comparison-retry"
          aria-label={`${item.symbol} 다시 조회`} onClick={() => onRetry(item.symbol!)}><RotateCcw aria-hidden="true" />다시 조회</button>}
      </span>}
    </li>)}
  </ul>;
}
