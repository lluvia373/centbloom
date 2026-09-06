"use client";
import { CalculationHelp } from "@/components/CalculationHelp";
import { AllocationChart } from "@/components/AllocationChart";
import {
AddTransactionLink,
PageHeading,
PortfolioMode,
} from "@/components/Header";
import { PerformanceAnalytics } from "@/components/PerformanceAnalytics";
import { PortfolioMetrics } from "@/components/PortfolioMetrics";
import { WealthChart } from "@/components/WealthChart";
import { usePreferences } from "@/hooks/usePortfolio";
import { useWorkspaceSummary } from "@/hooks/useWorkspace";
import { formatCurrency } from "@/lib/format";
import { ChevronDown,Leaf,Scale } from "lucide-react";
import { useState } from "react";
export default function InsightsPage() {
  const { summary, isDemo } = useWorkspaceSummary();
  const { displayCurrency } = usePreferences();
  const [details, setDetails] = useState(false);
  const holdings = summary?.holdings ?? [];
  const maxGain = Math.max(...holdings.map((h) => Math.abs(h.gainLossKRW)), 1);
  const ready = holdings.length > 0 && holdings.every((h) => h.quote);
  return (
    <>
      <PageHeading title="성과 분석">
        <AddTransactionLink />
      </PageHeading>
      <PortfolioMode />
      <PortfolioMetrics />
      <WealthChart expanded />
      <div className="analytics-grid">
        <section className="surface">
          <div className="surface-header">
            <div>
              <h2>종목별 수익 기여</h2>
              <p>보유 자산의 누적 평가손익 · 원화 기준</p>
            </div>
            <Scale size={17} color="#95ac85" />
          </div>
          {ready ? (
            <div className="contribution-list">
              {[...holdings]
                .sort((a, b) => b.gainLossKRW - a.gainLossKRW)
                .map((h) => (
                  <div className="contribution-item" key={h.id}>
                    <span>{h.name}</span>
                    <div className="contribution-track">
                      <span
                        className={h.gainLossKRW < 0 ? "negative" : ""}
                        style={{
                          width: `${(Math.abs(h.gainLossKRW) / maxGain) * 100}%`,
                        }}
                      />
                    </div>
                    <strong
                      className={h.gainLossKRW >= 0 ? "positive" : "negative"}
                    >
                      {h.gainLossKRW >= 0 ? "+" : ""}
                      {formatCurrency(h.gainLossKRW, "KRW")}
                    </strong>
                  </div>
                ))}
            </div>
          ) : (
            <div className="empty-chart">
              {holdings.length ? "시세 확인 필요" : "보유종목 없음"}
            </div>
          )}
        </section>
        <AllocationChart
          holdings={holdings}
          displayCurrency={displayCurrency}
        />
      </div>
      <div className="page-section">
        <section className="surface">
          <div className="surface-header">
            <h2>주가·환율 손익</h2>
            <p>원화 평가 기준</p>
          </div>
          <div className="insight-row">
            <span className="checkin-icon">
              <Leaf size={17} />
            </span>
            <p>
              주가 손익
              <br />
              <strong>
                {ready
                  ? formatCurrency(summary?.stockPriceImpactKRW ?? 0, "KRW")
                  : "—"}
              </strong>
            </p>
          </div>
          <div className="insight-row">
            <span className="checkin-icon">
              <Scale size={17} />
            </span>
            <p>
              환율 손익
              <br />
              <strong>
                {ready ? formatCurrency(summary?.fxImpactKRW ?? 0, "KRW") : "—"}
              </strong>
            </p>
          </div>
          <CalculationHelp label="주가·환율 손익">
            주가 손익은 매입 당시 환율로, 환율 손익은 매입 당시와 현재 환율의
            차이로 계산합니다. 합계는 원화 평가손익과 같습니다.
          </CalculationHelp>
        </section>

      </div>
      {!isDemo && (
        <section className="page-section">
          <button
            className="button-secondary"
            aria-expanded={details}
            onClick={() => setDetails(!details)}
          >
            기간별 상세 분석 및 벤치마크 비교 <ChevronDown size={15} />
          </button>
          {details && (
            <div className="mt-5">
              <PerformanceAnalytics />
            </div>
          )}
        </section>
      )}
    </>
  );
}
