"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  ChartNoAxesCombined,
  Loader2,
  Plus,
  RefreshCw,
} from "lucide-react";
import { getQuote } from "@/lib/stock-api";
import { formatCompactNumber, formatCurrency } from "@/lib/format";
import { PriceChange } from "@/components/PriceChange";
import { StockChart } from "@/components/StockChart";
import type { StockQuote } from "@/lib/types";

export function StockDetail({ symbol }: { symbol: string }) {
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const result = await getQuote(symbol);
        if (!cancelled) setQuote(result);
      } catch {
        if (!cancelled) setQuote(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [symbol, retry]);

  if (loading)
    return (
      <div
        role="status"
        className="flex items-center justify-center rounded-2xl border border-[#e8ece9] bg-white py-32 text-sm text-[#617365]"
      >
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        종목 정보를 가져오고 있어요
      </div>
    );

  if (!quote)
    return (
      <div className="rounded-2xl border border-[#e8ece9] bg-white px-6 py-24 text-center">
        <ChartNoAxesCombined className="mx-auto mb-5 h-9 w-9 text-[#617365]" />
        <h1 className="text-xl font-semibold text-[#1b2c26]">
          시세를 잠시 불러올 수 없어요
        </h1>
        <p className="mt-3 text-sm text-[#617365]">
          {symbol}의 데이터를 다시 확인해 주세요.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => setRetry((value) => value + 1)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#236b50] px-4 py-2.5 text-sm text-white"
          >
            <RefreshCw className="h-4 w-4" />
            다시 시도
          </button>
          <Link
            href="/search"
            className="rounded-xl border border-[#e8ece9] px-4 py-2.5 text-sm text-[#617365]"
          >
            종목 검색
          </Link>
        </div>
      </div>
    );

  const stats = [
    {
      label: "시가총액",
      value:
        quote.marketCap != null ? formatCompactNumber(quote.marketCap) : "—",
      suffix: quote.currency,
    },
    {
      label: "거래량",
      value: quote.volume != null ? formatCompactNumber(quote.volume) : "—",
      suffix: "주",
    },
    {
      label: "당일 고가",
      value:
        quote.dayHigh != null
          ? formatCurrency(quote.dayHigh, quote.currency)
          : "—",
    },
    {
      label: "당일 저가",
      value:
        quote.dayLow != null
          ? formatCurrency(quote.dayLow, quote.currency)
          : "—",
    },
    {
      label: "52주 고가",
      value:
        quote.fiftyTwoWeekHigh != null
          ? formatCurrency(quote.fiftyTwoWeekHigh, quote.currency)
          : "—",
    },
    {
      label: "52주 저가",
      value:
        quote.fiftyTwoWeekLow != null
          ? formatCurrency(quote.fiftyTwoWeekLow, quote.currency)
          : "—",
    },
    {
      label: "전일 종가",
      value:
        quote.previousClose != null
          ? formatCurrency(quote.previousClose, quote.currency)
          : "—",
    },
    { label: "거래 통화", value: quote.currency },
  ];

  return (
    <div className="space-y-6">
      <Link
        href="/portfolio"
        className="inline-flex items-center gap-1.5 text-xs text-[#617365] hover:text-[#236b50]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        포트폴리오로 돌아가기
      </Link>
      <div className="flex flex-col justify-between gap-6 rounded-2xl border border-[#e8ece9] bg-white p-6 sm:flex-row sm:items-center sm:p-8">
        <div>
          <div className="mb-6 flex items-center gap-4">
            <span className="flex h-13 w-13 items-center justify-center rounded-2xl bg-[#edf5ef] text-xl font-bold text-[#236b50]">
              {quote.symbol.slice(0, 1)}
            </span>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-[#617365]">
                {quote.symbol} · {quote.currency}
              </p>
              <h1 className="mt-1 text-xl font-semibold text-[#1b2c26]">
                {quote.name}
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="text-4xl font-semibold tracking-tight text-[#1b2c26]">
              {formatCurrency(quote.price, quote.currency)}
            </span>
            <PriceChange
              value={quote.change}
              percent={quote.changePercent}
              currency={quote.currency}
              size="lg"
            />
          </div>
          <p className="mt-3 text-[11px] text-[#617365]">
            최근 조회 시세 · 거래소에 따라 시세가 지연될 수 있습니다
          </p>
        </div>
        <Link
          href={`/search?symbol=${encodeURIComponent(quote.symbol)}`}
          className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#236b50] px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-[#1b563f]"
        >
          <Plus className="h-4 w-4" />이 종목 거래 기록
        </Link>
      </div>
      <StockChart key={symbol} symbol={symbol} currency={quote.currency} />
      <section className="rounded-2xl border border-[#e8ece9] bg-white p-6 sm:p-7">
        <h2 className="mb-6 text-base font-semibold text-[#1b2c26]">
          숫자로 보는 {quote.symbol}
        </h2>
        <dl className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label}>
              <dt className="text-xs text-[#617365]">{stat.label}</dt>
              <dd className="mt-2 text-base font-semibold text-[#1b2c26]">
                {stat.value}
                {stat.suffix && (
                  <span className="ml-1 text-[10px] font-normal text-[#617365]">
                    {stat.suffix}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <Link
        href="/journal"
        className="flex items-center justify-between gap-3 rounded-2xl border border-[#dce8dd] bg-[#edf5ef] p-5 text-[#236b50]"
      >
        <div>
          <p className="text-sm font-semibold">
            이 기업에 투자하는 이유가 있나요?
          </p>
          <p className="mt-1 text-xs text-[#617365]">
            투자 노트에 생각을 남기고, 다음 선택의 기준으로 삼아보세요.
          </p>
        </div>
        <ArrowUpRight className="h-5 w-5 shrink-0" />
      </Link>
    </div>
  );
}
