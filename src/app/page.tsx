"use client";
import { AllocationChart } from "@/components/AllocationChart";
import {
AddTransactionLink,
PageHeading,
PortfolioMode,
} from "@/components/Header";
import { HoldingsTable } from "@/components/HoldingsTable";
import { LiveMarkets } from "@/components/LiveMarkets";
import { PortfolioMetrics } from "@/components/PortfolioMetrics";
import { WatchlistPreview } from "@/components/WatchlistPreview";
import { WealthChart } from "@/components/WealthChart";
import { WorkspaceDate } from "@/components/WorkspaceDate";
import { usePortfolioMarket,usePreferences } from "@/hooks/usePortfolio";
import { useWorkspaceSummary } from "@/hooks/useWorkspace";
import { ArrowUpRight,BookOpen } from "lucide-react";
import Link from "next/link";
export default function DashboardPage() {
  const { summary, isDemo } = useWorkspaceSummary();
  const { displayCurrency } = usePreferences();
  const { loading, marketDataError } = usePortfolioMarket();
  return (
    <>
      <PageHeading
        eyebrow="OVERVIEW"
        title="나의 투자 대시보드"
        description="오늘의 자산을 확인하고, 다음 투자를 준비하세요."
      >
        <WorkspaceDate />
        <AddTransactionLink />
      </PageHeading>
      <PortfolioMode />
      {!isDemo && marketDataError && (
        <p
          role="status"
          className="mb-4 rounded-lg border border-[#e9d9b8] bg-[#fff9ed] px-4 py-3 text-xs text-[#727680]"
        >
          {marketDataError}
        </p>
      )}
      <PortfolioMetrics />
      <LiveMarkets />
      <div className="dashboard-main-grid">
        <WealthChart />
        <AllocationChart
          holdings={summary?.holdings ?? []}
          displayCurrency={displayCurrency}
        />
      </div>
      <div className="dashboard-bottom-grid">
        <HoldingsTable
          compact
          holdings={summary?.holdings ?? []}
          displayCurrency={displayCurrency}
          loading={!isDemo && loading}
          editable={!isDemo}
        />
        <div>
          <WatchlistPreview isDemo={isDemo} />
          <div className="checkin-card">
            <span className="checkin-icon">
              <BookOpen size={17} />
            </span>
            <div>
              <h3>투자 노트</h3>
              <p>매수와 매도의 이유를 기록해두세요.</p>
            </div>
            <Link href="/journal" aria-label="투자 노트 작성하기">
              <ArrowUpRight size={18} />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
