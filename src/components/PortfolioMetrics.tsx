"use client";
import Link from "next/link";
import { usePortfolioDailyChange, usePortfolioMarket, usePreferences } from "@/hooks/usePortfolio";
import { formatCurrency, formatPercent } from "@/lib/format";

export function PortfolioMetrics() {
  const { displayCurrency } = usePreferences();
  const { summary, loading } = usePortfolioMarket();
  const daily = usePortfolioDailyChange();
  const holdings = summary?.holdings ?? [];
  const hasData = holdings.length > 0 && holdings.every((holding) => holding.valuationAvailable);
  const hasGain = hasData && holdings.every((holding) => holding.gainAvailable);
  const money = (amount: number, signed = false) => `${signed && amount > 0 ? "+" : ""}${formatCurrency(amount, displayCurrency)}`;
  const tone = (amount: number, available: boolean) => !available || amount === 0 ? "" : amount > 0 ? "positive" : "negative";
  const gain = summary?.totalGainLoss ?? 0;
  const closedSymbols = Object.keys(daily.bySymbol).filter((symbol) => !holdings.some((holding) => holding.symbol === symbol));
  const closedChange = closedSymbols.reduce((sum, symbol) => sum + daily.bySymbol[symbol], 0);
  const status = loading ? "시세 확인 중" : holdings.length ? "일부 시세 확인 필요" : "보유종목 없음";

  return (
    <section className="portfolio-summary" aria-label="보유자산 요약">
      <dl className="portfolio-summary-grid">
        <div className="portfolio-summary-total">
          <dt>총 보유자산</dt>
          <dd className="portfolio-summary-value">{hasData ? money(summary!.totalValue) : "—"}</dd>
          <dd className="portfolio-summary-context">{hasData ? `${holdings.length}개 종목` : status}</dd>
        </div>
        <div>
          <dt>평가손익</dt>
          <dd className={`portfolio-summary-result ${tone(gain, hasGain)}`}>
            {hasGain ? money(gain, true) : "—"}
          </dd>
          <dd className="portfolio-summary-context">
            {hasGain ? <><span className={tone(gain, true)}>{formatPercent(summary!.totalGainLossPercent)}</span><span>매입원가 {money(summary!.totalCost)}</span></>
              : hasData ? "매입 정보 확인 필요" : "보유종목 기준"}
          </dd>
        </div>
        <div>
          <dt>오늘 변동</dt>
          <dd className={`portfolio-summary-result ${tone(daily.change, daily.available)}`}>
            {daily.available ? money(daily.change, true) : "—"}
          </dd>
          <dd className="portfolio-summary-context">
            {daily.available ? "00:00 KST 이후" : daily.reason}
          </dd>
        </div>
      </dl>
      <div className="portfolio-summary-footnote">
        {daily.available ? <p><span>오늘 변동 요인</span>
          <span title="기록한 수수료와 오늘 전량 매도한 종목의 손익도 포함합니다">주가·매매 <strong className={tone(daily.priceImpact, true)}>{money(daily.priceImpact, true)}</strong></span>
          <span>환율 <strong className={tone(daily.fxImpact, true)}>{money(daily.fxImpact, true)}</strong></span>
          {closedSymbols.length > 0 && <span>전량 매도 {closedSymbols.length}종목 {money(closedChange, true)} 포함</span>}
        </p> : null}
        <Link href="#performance">기간 성과 <span aria-hidden="true">→</span></Link>
      </div>
    </section>
  );
}
