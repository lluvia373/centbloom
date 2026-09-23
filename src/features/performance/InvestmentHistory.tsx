"use client";

import { usePerformanceHistory } from "@/hooks/usePerformanceHistory";
import { useTransactions } from "@/hooks/usePortfolio";
import { PerformanceTable } from "./PerformanceTable";

export function InvestmentHistory() {
  const { transactions } = useTransactions();
  const { points, loading, error, refreshError, scopeKey } = usePerformanceHistory();

  if (points.length === 0) {
    return (
      <div className="performance-empty" aria-busy={loading}>
        <p role={loading ? "status" : undefined}>
          {loading ? "성과 불러오는 중" : error ? "성과 조회 실패" : "성과 기록 없음"}
        </p>
        {error && <p role="alert" className="performance-notice text-cf-negative">{error}</p>}
      </div>
    );
  }

  // The shared hook returns points for this account/revision/date only. This
  // full-history view has no additional chart range to invalidate cached data.
  return (
    <div aria-busy={loading}>
      {refreshError && <p role="status" className="performance-notice text-cf-muted">
        갱신하지 못해 이전 결과를 표시합니다.
      </p>}
      <PerformanceTable key={scopeKey} points={points} transactions={transactions} embedded />
      {error && !refreshError && <p role="alert" className="performance-notice text-cf-negative">{error}</p>}
    </div>
  );
}
