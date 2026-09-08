"use client";
import { PortfolioAd } from "@/features/ads/PortfolioAd";
import {
AddTransactionLink,
CurrencySwitch,
PageHeading,
} from "@/components/Header";
import { HoldingsTable } from "@/components/HoldingsTable";
import { PortfolioMetrics } from "@/components/PortfolioMetrics";
import { WealthChart } from "@/components/WealthChart";
import { AllocationChart } from "@/components/AllocationChart";
import { usePortfolioMarket,usePreferences,useTransactions } from "@/hooks/usePortfolio";
import { Download } from "lucide-react";
export default function PortfolioPage() {
  const { transactions } = useTransactions();


  const { displayCurrency } = usePreferences();
  const { summary, loading, marketDataError } = usePortfolioMarket();

  const exportHoldings = () => {
    const rows = [
      ["내 보유 자산", "표시 통화", displayCurrency],
      ["종목", "이름", "수량", "평가액", "평가손익", "수익률(%)"],
      ...(summary?.holdings ?? []).map((h) => [
        h.symbol,
        h.name,
        h.quantity,
        h.quote ? h.displayMarketValue : "시세 미확인",
        h.quote ? h.displayGainLoss : "시세 미확인",
        h.quote ? h.displayGainLossPercent : "시세 미확인",
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
      <PageHeading title="보유자산">
        <CurrencySwitch />
        <AddTransactionLink />
      </PageHeading>

      {marketDataError && (
        <p
          role="status"
          className="mb-4 rounded-cf-control bg-cf-warning-soft p-3 text-cf-caption text-cf-muted"
        >
          {marketDataError}
        </p>
      )}
      <PortfolioMetrics />
      <details className="mb-6" open><summary className="mb-4 cursor-pointer text-cf-label font-semibold text-cf-muted">자산 흐름과 배분</summary><div className="dashboard-main-grid"><WealthChart/><AllocationChart holdings={summary?.holdings ?? []} displayCurrency={displayCurrency}/></div></details>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-cf-section font-semibold">보유종목</h2>
        {(summary?.holdings.length ?? 0) > 0 && (
          <button className="button-secondary" onClick={exportHoldings}>
            <Download size={13} />
            보유 자산 CSV
          </button>
        )}
      </div>
        <HoldingsTable
          holdings={summary?.holdings ?? []}
          displayCurrency={displayCurrency}
          loading={loading}
          editable
        />

      <PortfolioAd hasContent={transactions.length > 0} />
    </>
  );
}
