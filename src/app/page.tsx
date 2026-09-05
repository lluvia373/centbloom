"use client";
import Link from "next/link";
import { ArrowUpRight, BookOpen } from "lucide-react";
import { WorkspaceDate } from "@/components/WorkspaceDate";
import {
  PageHeading,
  AddTransactionLink,
  PortfolioMode,
} from "@/components/Header";
import { PortfolioMetrics } from "@/components/PortfolioMetrics";
import { WealthChart } from "@/components/WealthChart";
import { AllocationChart } from "@/components/AllocationChart";
import { HoldingsTable } from "@/components/HoldingsTable";
import { WatchlistPreview } from "@/components/WatchlistPreview";
import { useWorkspace } from "@/hooks/useWorkspace";
import { usePortfolio } from "@/hooks/usePortfolio";
export default function DashboardPage() {
  const { summary, isDemo } = useWorkspace();
  const { displayCurrency, loading, marketDataError } = usePortfolio();
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
