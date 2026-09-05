"use client";

import { PriceChange } from "@/components/PriceChange";
import { usePortfolio } from "@/hooks/usePortfolio";
import { formatCurrency } from "@/lib/format";
import type { PortfolioSummary } from "@/lib/types";

interface PortfolioSummaryCardsProps {
  summary: PortfolioSummary | null;
  loading?: boolean;
}

export function PortfolioSummaryCards({ summary, loading }: PortfolioSummaryCardsProps) {
  const { displayCurrency } = usePortfolio();
  const baseCurrency = summary?.baseCurrency ?? displayCurrency;
  const placeholder = loading ? "불러오는 중" : "—";

  return (
    <section className="grid overflow-hidden rounded-3xl border border-[#e9eaed] bg-[#ffffff] sm:grid-cols-2 lg:grid-cols-4">
      <div className="p-5 sm:p-6">
        <p className="text-xs text-[#727680]">총 자산</p>
        <p className="mt-2 text-xl font-bold tracking-tight text-[#202329]">
          {summary ? formatCurrency(summary.totalAssets, baseCurrency) : placeholder}
        </p>
      </div>
      <div className="border-t border-[#e9eaed] p-5 sm:border-l sm:border-t-0 sm:p-6">
        <p className="text-xs text-[#727680]">투자자산</p>
        <p className="mt-2 text-lg font-semibold text-[#202329]">
          {summary ? formatCurrency(summary.investmentAssets, baseCurrency) : placeholder}
        </p>
      </div>
      <div className="border-t border-[#e9eaed] p-5 sm:p-6 lg:border-l lg:border-t-0">
        <p className="text-xs text-[#727680]">투자성과</p>
        <div className="mt-2">
          {summary ? <PriceChange value={summary.investmentGainLoss} percent={summary.investmentGainLossPercent} currency={baseCurrency} size="sm" /> : <span className="text-[#727680]">{placeholder}</span>}
        </div>
      </div>
      <div className="border-t border-[#e9eaed] p-5 sm:border-l sm:p-6 lg:border-t-0">
        <p className="text-xs text-[#727680]">손익 원인 · 원화</p>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {summary ? (
            <><span className="text-[#727680]">주가 {formatCurrency(summary.stockPriceImpactKRW, "KRW")}</span><span className="text-[#727680]">환율 {formatCurrency(summary.fxImpactKRW, "KRW")}</span></>
          ) : <span className="text-[#727680]">{placeholder}</span>}
        </div>
      </div>
    </section>
  );
}
