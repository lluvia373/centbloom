"use client";
import { PortfolioAd } from "@/features/ads/PortfolioAd";
import {
  AddTransactionLink,
  CurrencySwitch,
  PageHeading,
} from "@/components/Header";
import { HoldingsTable } from "@/components/HoldingsTable";
import { PerformanceAnalytics } from "@/components/PerformanceAnalytics";
import { PortfolioMetrics } from "@/components/PortfolioMetrics";
import { PortfolioDetails } from "@/features/portfolio/ui/PortfolioDetails";
import { PortfolioSwitcher } from "@/features/portfolio/ui/PortfolioSwitcher";
import { StorageNotice } from "@/components/StorageNotice";
import { InvestmentHistory } from "@/features/performance/InvestmentHistory";
import { SharedDividendSchedule } from "@/features/dividends/SharedDividendSchedule";
import styles from "@/features/portfolio/ui/PortfolioHoldings.module.css";
import { usePortfolioDailyChange, usePortfolioMarket, usePreferences, useTransactions, usePortfolios } from "@/hooks/usePortfolio";
import { Download } from "lucide-react";
export default function PortfolioPage() {
  const { transactions } = useTransactions();
  const { portfolios, selectedPortfolioId } = usePortfolios();
  const portfolioName = selectedPortfolioId === "all" ? "전체" : portfolios.find(item => item.id === selectedPortfolioId)?.name ?? "";
  const { displayCurrency } = usePreferences();
  const { summary, loading, marketDataError, valuationFxNotice } = usePortfolioMarket();
  const dailyChange = usePortfolioDailyChange();

  const exportHoldings = () => {
    const rows = [
      ["내 보유 자산", "표시 통화", displayCurrency],
      ["포트폴리오", portfolioName],
      ...(valuationFxNotice ? [["적용 환율", valuationFxNotice]] : []),
      ["종목", "이름", "수량", "평가액", "평가손익", "수익률(%)"],
      ...(summary?.holdings ?? []).map((h) => [
        h.symbol,
        h.name,
        h.quantity,
        h.valuationAvailable ? h.displayMarketValue : "시세·환율 미확인",
        h.gainAvailable ? h.displayGainLoss : "계산 자료 미확인",
        h.gainAvailable ? h.displayGainLossPercent : "계산 자료 미확인",
      ]),
    ];
    const csv = rows
      .map((row) =>
        row
          .map((cell) => {
            const value = String(cell);
            const safe =
              typeof cell === "string" && /^[=+@-]/.test(value)
                ? `'${value}`
                : value;
            return `"${safe.replaceAll('"', '""')}"`;
          })
          .join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "centbloom-holdings.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  return (
    <>
      <div className={styles.pageHeading}>
        <PageHeading title="보유자산" titleAction={<PortfolioSwitcher />}>
          <CurrencySwitch />
          <AddTransactionLink />
        </PageHeading>
      </div>
      <StorageNotice placement="inline" />
      {marketDataError && (
        <p
          role="status"
          className="mb-4 rounded-cf-control bg-cf-warning-soft p-3 text-cf-caption text-cf-muted"
        >
          {marketDataError}
        </p>
      )}
      <div className="portfolio-overview">
        <PortfolioMetrics />
        <section id="performance" tabIndex={-1} className={styles.performance} aria-label="기간 성과">
          <PerformanceAnalytics />
        </section>
      </div>
      <PortfolioDetails
        key={selectedPortfolioId}
        history={<InvestmentHistory />}
        holdings={<>{summary != null ? <HoldingsTable
          holdings={summary.holdings}
          transactions={transactions}
          displayCurrency={displayCurrency}
          loading={loading}
          editable
          embedded
          showAllocation
          dailyChanges={dailyChange.available ? dailyChange.bySymbol : undefined}
          dailyChangeReason={dailyChange.reason}
          referenceDatesBySymbol={dailyChange.referenceDatesBySymbol}
          carriedDatesBySymbol={dailyChange.carriedDatesBySymbol}
          toolbarAction={summary.holdings.length > 0 ? (
            <button type="button" className={styles.csv} onClick={exportHoldings}>
              <Download size={16} aria-hidden="true" />보유 자산 CSV
            </button>
          ) : undefined}
        /> : <p className={styles.empty} role={loading ? "status" : "alert"}>{loading ? "보유종목 확인 중" : "보유종목을 확인하지 못했습니다."}</p>}
        {process.env.NODE_ENV === "development" && <SharedDividendSchedule key={selectedPortfolioId} transactions={transactions} portfolioId={selectedPortfolioId} />}
        </>}
      />

      <PortfolioAd hasContent={transactions.length > 0} />
    </>
  );
}
