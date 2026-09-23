"use client";
import { usePortfolioDailyChange, usePortfolioMarket, usePreferences } from "@/hooks/usePortfolio";
import { formatCurrency, formatPercent } from "@/lib/format";
import { getDailyBreakdownDisplay } from "@/features/portfolio/ui/daily-breakdown-presentation";

export function PortfolioMetrics() {
  const { displayCurrency } = usePreferences();
  const { summary, loading, valuationFxNotice } = usePortfolioMarket();
  const daily = usePortfolioDailyChange();
  const holdings = summary?.holdings ?? [];
  const hasData = summary != null && holdings.every((holding) => holding.valuationAvailable);
  const hasGain = hasData && holdings.every((holding) => holding.gainAvailable);
  const money = (amount: number, signed = false) => `${signed && amount > 0 ? "+" : ""}${formatCurrency(amount, displayCurrency)}`;
  const tone = (amount: number, available: boolean) => !available || amount === 0 ? "" : amount > 0 ? "positive" : "negative";
  const gain = summary?.totalGainLoss ?? 0;
  let breakdown: ReturnType<typeof getDailyBreakdownDisplay> | null = null;
  if (daily.available) {
    try {
      breakdown = getDailyBreakdownDisplay(daily.change, daily.priceImpact, daily.fxImpact, displayCurrency);
    } catch (error) {
      if (!(error instanceof TypeError || error instanceof RangeError)) throw error;
    }
  }
  const closedSymbols = Object.keys(daily.bySymbol).filter((symbol) => !holdings.some((holding) => holding.symbol === symbol));
  const closedChange = closedSymbols.reduce((sum, symbol) => sum + daily.bySymbol[symbol], 0);
  const status = loading ? "시세 확인 중" : summary == null ? "거래 기록 확인 필요"
    : holdings.length ? "일부 시세 확인 필요" : "보유종목 없음";

  return (
    <section className="portfolio-summary" aria-label="보유자산 요약">
      <dl className="portfolio-summary-grid">
        <div className="portfolio-summary-total">
          <dt>총 보유자산</dt>
          <dd className="portfolio-summary-value">{hasData ? money(summary!.totalValue) : "—"}</dd>
          {(!hasData || !holdings.length) && <dd className="portfolio-summary-context">{status}</dd>}
          {hasData && holdings.length > 0 && valuationFxNotice && <dd className="portfolio-summary-context">{valuationFxNotice}</dd>}
        </div>
        <div className="portfolio-summary-valuation">
          <dt>평가손익</dt>
          <dd className={`portfolio-summary-result portfolio-summary-gain ${tone(gain, hasGain)}`}>
            <span>{hasGain ? money(gain, true) : "—"}</span>
            {hasGain && holdings.length > 0 && <span className="portfolio-summary-percent">{formatPercent(summary!.totalGainLossPercent)}</span>}
          </dd>
          {hasGain && holdings.length > 0 && <dd className="portfolio-summary-context portfolio-summary-cost">매입원가 {money(summary!.totalCost)}</dd>}
          {!hasGain && <dd className="portfolio-summary-context">
            {hasData ? "매입 정보 확인 필요" : "보유종목 기준"}
          </dd>}
        </div>
        <div className="portfolio-summary-daily">
          <dt>오늘 손익</dt>
          <dd className={`portfolio-summary-result ${tone(breakdown?.total ?? daily.change, daily.available && Number.isFinite(daily.change))}`}>
            {breakdown ? money(breakdown.total, true)
              : daily.available && Number.isFinite(daily.change) ? money(daily.change, true) : "—"}
          </dd>
          {breakdown && <dd className="portfolio-summary-factors" aria-label="오늘 손익 구성">
            <span className="portfolio-summary-factor">
              <span>종목 손익</span>
              <strong className={tone(breakdown.stock, true)}>{money(breakdown.stock, true)}</strong>
            </span>
            <span className="portfolio-summary-factor">
              <span>환율 손익</span>
              <strong className={tone(breakdown.fx, true)}>{money(breakdown.fx, true)}</strong>
            </span>
          </dd>}
          {!daily.available && <dd className="portfolio-summary-context">{daily.reason}</dd>}
          {daily.available && !breakdown && <dd className="portfolio-summary-context">세부 손익 표시 불가</dd>}
          {daily.available && closedSymbols.length > 0 && <dd className="portfolio-summary-context">
            전량 매도 {closedSymbols.length}종목 {money(closedChange, true)} 포함
          </dd>}
        </div>
      </dl>
    </section>
  );
}
