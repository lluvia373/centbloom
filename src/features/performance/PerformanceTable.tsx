"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import type { PortfolioPerformancePoint, Transaction } from "@/lib/types";
import { buildPeriodSummaries, type PeriodSummary } from "./period-summary";

const PAGE_SIZE = 6;

export function PerformanceTable({ points, transactions, embedded = false }: {
  points: PortfolioPerformancePoint[];
  transactions: Transaction[];
  embedded?: boolean;
}) {
  const [granularity, setGranularity] = useState<"month" | "year">("month");
  const [page, setPage] = useState(0);
  const rows = useMemo(() => buildPeriodSummaries(points, transactions, granularity),
    [points, transactions, granularity]);
  const pageCount = Math.ceil(rows.length / PAGE_SIZE);
  const currentPage = Math.min(page, Math.max(0, pageCount - 1));
  const visibleRows = rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  if (rows.length === 0) return null;

  return (
    <section className={`performance-history${embedded ? " performance-history-embedded" : ""}`} aria-label="투자 성과">
      <div className="performance-history-header">
        <div className="performance-history-heading">
          {!embedded && <h3>투자 성과</h3>}
          <span className="performance-basis">전체 기간 · 원화 기준</span>
        </div>
        <div className="performance-modes" role="group" aria-label="성과 집계 단위">
          {(["month", "year"] as const).map((value) => (
            <button key={value} type="button" className="performance-choice"
              aria-pressed={granularity === value}
              onClick={() => { setGranularity(value); setPage(0); }}
            >{value === "month" ? "월별" : "연도별"}</button>
          ))}
        </div>
      </div>
      <table className="performance-history-table">
        <caption className="sr-only">{granularity === "month" ? "월별" : "연도별"} 투자 성과 · 전체 기간 · 원화 기준</caption>
        <thead><tr><th scope="col">기간</th><th scope="col">투자손익</th><th scope="col">수익률</th></tr></thead>
        <tbody>
          {visibleRows.map((row) => {
            const amount = row.profitKRW == null ? null : Math.round(row.profitKRW);
            const rate = row.securitiesReturn == null ? null : Math.round(row.securitiesReturn * 100) / 100;
            return (
              <tr key={row.key}>
                <th scope="row">
                  {row.key.slice(0, 4)}년{granularity === "month" ? ` ${Number(row.key.slice(5))}월` : ""}
                  {!row.complete && <span className="performance-history-coverage">{coverageLabel(row)}</span>}
                </th>
                <td className={valueTone(amount)}>{amount == null || !Number.isFinite(amount) ? "계산 불가"
                  : `${amount > 0 ? "+" : ""}${formatCurrency(amount === 0 ? 0 : amount, "KRW")}`}</td>
                <td className={valueTone(rate)}>{row.inactive ? <span className="text-cf-muted">미운용</span>
                  : rate == null || !Number.isFinite(rate) ? "계산 불가" : `${rate > 0 ? "+" : ""}${rate.toFixed(2)}%`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {pageCount > 1 && <nav className="performance-history-pagination" aria-label="투자 성과 페이지">
        <button type="button" className="performance-history-page" aria-label="최근 기간 보기"
          disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
          <ChevronLeft aria-hidden="true" />
        </button>
        <span role="status" aria-live="polite" aria-atomic="true">{currentPage + 1} / {pageCount}</span>
        <button type="button" className="performance-history-page" aria-label="이전 기간 보기"
          disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}>
          <ChevronRight aria-hidden="true" />
        </button>
      </nav>}
    </section>
  );
}

function valueTone(value: number | null) {
  if (value == null || !Number.isFinite(value) || value === 0) return "text-cf-ink";
  return value > 0 ? "text-cf-market-up" : "text-cf-market-down";
}

function coverageLabel(row: PeriodSummary) {
  const shortDate = (date: string) => `${Number(date.slice(5, 7))}. ${Number(date.slice(8))}.`;
  return `${shortDate(row.startDate)} – ${shortDate(row.endDate)}`;
}
