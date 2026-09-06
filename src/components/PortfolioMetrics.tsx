"use client";
import { CalculationHelp } from "@/components/CalculationHelp";
import { usePortfolioMarket,usePreferences } from "@/hooks/usePortfolio";
import { useWorkspaceSummary } from "@/hooks/useWorkspace";
import { formatCurrency,formatPercent } from "@/lib/format";
import {
ArrowUpRight,
CircleDollarSign,
TrendingUp,
Wallet,
} from "lucide-react";

export function PortfolioMetrics() {
  const { summary, isDemo } = useWorkspaceSummary();
  const { displayCurrency } = usePreferences();
  const { loading } = usePortfolioMarket();
  const holdings = summary?.holdings ?? [];
  const hasData =
    holdings.length > 0 &&
    holdings.every((h) => h.quote && (h.currentFxRateToKRW ?? 0) > 0);
  const dayChange = holdings.reduce(
    (sum, h) =>
      sum +
      (h.quote && h.quote.price > 0
        ? (h.displayMarketValue * h.quote.change) / h.quote.price
        : 0),
    0,
  );
  const dayPercent =
    (summary?.totalValue ?? 0) - dayChange > 0
      ? (dayChange / ((summary?.totalValue ?? 0) - dayChange)) * 100
      : 0;
  const gain = summary?.totalGainLoss ?? 0;
  const value = (number: number, sign = false) =>
    hasData
      ? `${sign && number >= 0 ? "+" : ""}${formatCurrency(number, displayCurrency)}`
      : "—";
  return (
    <div className="metric-grid">
      <section className="metric-card primary" aria-label="총 투자자산">
        <div className="metric-label">
          총 투자자산{" "}
          <CalculationHelp label="총 투자자산">현재 주식과 ETF 평가액의 합계. 현금 잔액은 포함하지 않습니다.</CalculationHelp>
        </div>
        <span className="metric-icon">
          <Wallet size={17} />
        </span>
        <h2 className="metric-number">{value(summary?.totalValue ?? 0)}</h2>
        <p className="metric-meta">
          <span className="return-pill">
            <ArrowUpRight size={11} />
            {holdings.length}개 종목
          </span>
          <span>
            {isDemo
              ? "샘플 자산 · 현금 미포함"
              : loading
                ? "시세 확인 중"
                : hasData
                  ? "현금 미포함"
                  : holdings.length ? "시세 확인 필요" : "보유종목 없음"}
          </span>
        </p>
      </section>
      <section className="metric-card" aria-label="누적 평가손익">
        <div className="metric-label">
          누적 평가손익{" "}
          <CalculationHelp label="누적 평가손익">보유 자산의 평가액과 매입원가 차이. 입출금의 영향을 제외하는 운용수익률과 구분합니다.</CalculationHelp>
        </div>
        <span className="metric-icon">
          <TrendingUp size={16} />
        </span>
        <h2 className={`metric-number ${gain >= 0 ? "positive" : "negative"}`}>
          {value(gain, true)}
        </h2>
        <p className="metric-meta">
          <span className={`return-pill ${gain < 0 ? "negative" : ""}`}>
            {hasData ? formatPercent(summary?.totalGainLossPercent ?? 0) : "—"}
          </span>
          <span>매입원가 대비</span>
        </p>
      </section>
      <section className="metric-card" aria-label="주가의 하루 변동">
        <div className="metric-label">
          오늘의 주가 변동{" "}
          <CalculationHelp label="오늘의 주가 변동">보유 수량과 최근 거래일 종가 대비 주가 변동. 당일 환율 변동은 제외합니다.</CalculationHelp>
        </div>
        <span className="metric-icon">
          <CircleDollarSign size={16} />
        </span>
        <h2
          className={`metric-number ${dayChange >= 0 ? "positive" : "negative"}`}
        >
          {value(dayChange, true)}
        </h2>
        <p className="metric-meta">
          <span className={`return-pill ${dayChange < 0 ? "negative" : ""}`}>
            {hasData ? formatPercent(dayPercent) : "—"}
          </span>
          <span>전일 종가 대비 · 환율 고정</span>
        </p>
      </section>
    </div>
  );
}
