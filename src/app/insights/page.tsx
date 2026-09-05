"use client";
import { useState } from "react";
import { ChevronDown, Leaf, Lightbulb, Scale } from "lucide-react";
import {
  PageHeading,
  AddTransactionLink,
  PortfolioMode,
} from "@/components/Header";
import { PortfolioMetrics } from "@/components/PortfolioMetrics";
import { WealthChart } from "@/components/WealthChart";
import { AllocationChart } from "@/components/AllocationChart";
import { PerformanceAnalytics } from "@/components/PerformanceAnalytics";
import { useWorkspace } from "@/hooks/useWorkspace";
import { usePortfolio } from "@/hooks/usePortfolio";
import { formatCurrency } from "@/lib/format";
export default function InsightsPage() {
  const { summary, isDemo } = useWorkspace();
  const { displayCurrency } = usePortfolio();
  const [details, setDetails] = useState(false);
  const holdings = summary?.holdings ?? [];
  const largest = [...holdings].sort(
    (a, b) => b.displayMarketValue - a.displayMarketValue,
  )[0];
  const maxGain = Math.max(...holdings.map((h) => Math.abs(h.gainLossKRW)), 1);
  const ready = holdings.length > 0 && holdings.every((h) => h.quote);
  return (
    <>
      <PageHeading
        eyebrow="A CLEARER PERSPECTIVE"
        title="숫자 너머의 투자성과"
        description="수익이 어디에서 왔는지, 나의 투자는 어떻게 달라졌는지."
      >
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
              시세가 확인된 자산을 기록하면 기여도를 보여드려요.
            </div>
          )}
        </section>
        <AllocationChart
          holdings={holdings}
          displayCurrency={displayCurrency}
        />
      </div>
      <div className="analytics-grid">
        <section className="surface">
          <div className="surface-header">
            <h2>내 수익의 두 가지 원인</h2>
            <p>원화 평가 기준</p>
          </div>
          <div className="insight-row">
            <span className="checkin-icon">
              <Leaf size={17} />
            </span>
            <p>
              주가 변화가 만든 손익
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
              환율 변화가 만든 손익
              <br />
              <strong>
                {ready ? formatCurrency(summary?.fxImpactKRW ?? 0, "KRW") : "—"}
              </strong>
            </p>
          </div>
          <p className="analytics-note">
            주가 손익은 매입 당시 환율로, 환율 손익은 매입 당시와 현재 환율의
            차이로 계산합니다. 합계는 원화 평가손익과 같습니다.
          </p>
        </section>
        <section className="surface">
          <div className="surface-header">
            <h2>나의 포트폴리오 읽기</h2>
            <Lightbulb size={17} color="#a2b58f" />
          </div>
          <div className="insight-explanation">
            <Leaf size={21} />
            <div>
              <h3>
                {ready && largest
                  ? `${largest.name}, 가장 큰 자산의 조각`
                  : "기록이 쌓이면 투자가 보입니다"}
              </h3>
              <p>
                {ready && largest
                  ? `${largest.name}의 비중은 전체 투자자산의 ${((largest.displayMarketValue / (summary?.totalValue || 1)) * 100).toFixed(1)}%입니다. ${holdings.length}개 보유 종목이 만드는 자산의 구성을 확인해 보세요.`
                  : "첫 거래를 기록한 뒤 자산 배분과 수익 기여도를 확인할 수 있습니다."}
              </p>
            </div>
          </div>
          <div className="insight-explanation">
            <Lightbulb size={21} />
            <div>
              <h3>평가손익과 운용수익률은 달라요</h3>
              <p>
                평가손익은 보유 자산과 매입원가의 차이입니다. 운용수익률은 자금
                유입·유출의 영향을 제외해 기간별 투자 성과를 살펴봅니다.
              </p>
            </div>
          </div>
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
