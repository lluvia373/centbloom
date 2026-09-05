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
        eyebrow="YOUR WEALTH, YOUR WAY"
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
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800"
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
              <h3>숫자 뒤에 있는 나의 생각</h3>
              <p>오늘의 투자 이유를 짧게 남겨보세요.</p>
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
