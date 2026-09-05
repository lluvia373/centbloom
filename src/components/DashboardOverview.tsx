"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, CalendarDays, CircleDollarSign } from "lucide-react";
import { DashboardPerformanceChart } from "@/components/DashboardPerformanceChart";
import { PriceChange } from "@/components/PriceChange";
import { formatCurrency } from "@/lib/format";
import type { DisplayCurrency, PortfolioSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

interface DashboardOverviewProps {
  summary: PortfolioSummary | null;
  displayCurrency: DisplayCurrency;
  loading?: boolean;
}

export function DashboardOverview({
  summary,
  displayCurrency,
  loading,
}: DashboardOverviewProps) {
  const totalAssets = summary?.totalAssets ?? 0;

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-[#e9eaed] bg-[#ffffff] shadow-sm shadow-black/[0.02]">
      <div className="grid lg:grid-cols-[1.55fr_0.75fr]">
        <div className="p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-[#727680]">내 총 자산</p>
              <p className={cn("mt-2 text-3xl font-bold tracking-[-0.04em] text-[#202329] sm:text-4xl", loading ? "animate-pulse text-[#727680]" : "") }>
                {summary ? formatCurrency(totalAssets, displayCurrency) : "—"}
              </p>
              <div className="mt-2 min-h-6">
                {summary ? (
                  <PriceChange
                    value={summary.investmentGainLoss}
                    percent={summary.investmentGainLossPercent}
                    currency={displayCurrency}
                    size="sm"
                  />
                ) : (
                  <span className="text-xs text-[#727680]">
                    자산을 등록하면 성과를 표시합니다.
                  </span>
                )}
              </div>
            </div>

            <Link
              href="/insights"
              className="group flex shrink-0 items-center gap-1.5 rounded-full border border-[#e9eaed] bg-[#f6f7f8] px-3.5 py-2 text-xs font-semibold text-[#515660] transition-colors hover:border-[#3b8879]/40 hover:text-[#202329]"
            >
              상세 분석
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>

          <div className="mt-6 rounded-2xl bg-gradient-to-b from-[#3b8879]/[0.06] to-transparent p-3 sm:p-4">
            <DashboardPerformanceChart />
          </div>
        </div>

        <div className="border-t border-[#e9eaed] bg-[#ffffff] p-5 sm:p-7 lg:border-l lg:border-t-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#202329]">
            <ArrowUpRight className="h-4 w-4 text-[#3b8879]" />
            자산 변화 해석
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-1">
            <div className="rounded-2xl bg-[#f6f7f8] p-4">
              <p className="text-xs text-[#727680]">주가 영향</p>
              <div className="mt-1.5">
                {summary ? <PriceChange value={summary.stockPriceImpactKRW} currency="KRW" size="sm" /> : <span>—</span>}
              </div>
            </div>
            <div className="rounded-2xl bg-[#f6f7f8] p-4">
              <p className="text-xs text-[#727680]">환율 영향</p>
              <div className="mt-1.5">
                {summary ? <PriceChange value={summary.fxImpactKRW} currency="KRW" size="sm" /> : <span>—</span>}
              </div>
            </div>
          </div>
          <div className="mt-4 space-y-2 text-xs text-[#727680]">
            <p className="flex items-center gap-2"><CircleDollarSign className="h-3.5 w-3.5" /> 현금·배당 기여도 연결 예정</p>
            <p className="flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5" /> 매일 23:59:59 KST 기준 기록</p>
          </div>
        </div>
      </div>
    </section>
  );
}
