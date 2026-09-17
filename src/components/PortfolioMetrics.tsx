"use client";
import { usePortfolioMarket, usePreferences } from "@/hooks/usePortfolio";
import { formatCurrency, formatPercent } from "@/lib/format";

export function PortfolioMetrics() {
  const { displayCurrency } = usePreferences();
  const { summary, loading } = usePortfolioMarket();
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
  const status = loading
    ? "시세 확인 중"
    : hasData
      ? null
      : holdings.length ? "시세 확인 필요" : "보유종목 없음";

  return (
    <section className="portfolio-summary" aria-label="보유자산 요약">
      <div className="portfolio-summary-heading">
        <h2>주식·ETF 평가액</h2>
        {holdings.length > 0 && <span>{holdings.length}개 종목</span>}
      </div>
      <p className="portfolio-summary-value">{value(summary?.totalValue ?? 0)}</p>
      {status && <p className="portfolio-summary-status" role="status">{status}</p>}
      <dl className="portfolio-summary-details">
        <div>
          <dt>보유종목 평가손익</dt>
          <dd className={`portfolio-summary-result ${hasData ? gain >= 0 ? "positive" : "negative" : ""}`}>
            <span>{value(gain, true)}</span>
            {hasData && <span className="portfolio-summary-percent">{formatPercent(summary?.totalGainLossPercent ?? 0)}</span>}
          </dd>
          <dd className="portfolio-summary-context">매입원가 {value(summary?.totalCost ?? 0)}</dd>
        </div>
        <div>
          <dt>하루 주가 변동</dt>
          <dd className={`portfolio-summary-result ${hasData ? dayChange >= 0 ? "positive" : "negative" : ""}`}>
            <span>{value(dayChange, true)}</span>
            {hasData && <span className="portfolio-summary-percent">{formatPercent(dayPercent)}</span>}
          </dd>
          <dd className="portfolio-summary-context">전일 종가 대비 · 환율 고정</dd>
        </div>
      </dl>
    </section>
  );
}
