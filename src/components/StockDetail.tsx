"use client";

import { AssetAvatar } from "@/components/AssetAvatar";
import { PriceChange } from "@/components/PriceChange";
import { QuoteStatus } from "@/components/QuoteStatus";
import { StockChart } from "@/components/StockChart";
import { MarketNews } from "@/features/home/MarketNews";
import { WatchStockButton } from "@/features/watchlist/WatchStockButton";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { formatCompactNumber,formatCurrency } from "@/lib/format";
import {
ArrowLeft,
ArrowUpRight,
ChartNoAxesCombined,
Loader2,
Plus,
RefreshCw,
} from "lucide-react";
import Link from "next/link";

export function StockDetail({ symbol }: { symbol: string }) {
  const live=useLiveQuotes([symbol]);const quote=live.quotes[symbol];
  return <div className="space-y-6"><QuoteDetail symbol={symbol} live={live} /><StockChart key={symbol} symbol={symbol} currency={quote?.currency??''} />{quote&&<StockStats quote={quote}/>}<MarketNews key={symbol} symbol={symbol}/></div>;
}
function QuoteDetail({ symbol,live }: { symbol: string;live:ReturnType<typeof useLiveQuotes> }) {
  const { quotes, loading, refreshing, failedSymbols, refresh } = live;
  const quote = quotes[symbol];

  if (loading)
    return (
      <div
        role="status"
        className="flex items-center justify-center rounded-2xl border border-[#e6e8eb] bg-[#ffffff] py-32 text-sm text-[#727680]"
      >
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        종목 정보를 가져오고 있어요
      </div>
    );

  if (!quote)
    return (
      <div className="rounded-2xl border border-[#e6e8eb] bg-[#ffffff] px-6 py-24 text-center">
        <ChartNoAxesCombined className="mx-auto mb-5 h-9 w-9 text-[#727680]" />
        <h1 className="text-xl font-semibold text-[#202329]">
          시세를 잠시 불러올 수 없어요
        </h1>
        <p className="mt-3 text-sm text-[#727680]">
          {symbol}의 데이터를 다시 확인해 주세요.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center gap-2 rounded-xl bg-[#25282e] px-4 py-2.5 text-sm text-[#ffffff]"
          >
            <RefreshCw className="h-4 w-4" />
            다시 시도
          </button>
          <Link
            href="/discover"
            className="rounded-xl border border-[#e6e8eb] px-4 py-2.5 text-sm text-[#727680]"
          >
            종목 검색
          </Link>
        </div>
      </div>
    );


  return (
    <div className="space-y-6">
      <Link
        href="/discover"
        className="inline-flex items-center gap-1.5 text-xs text-[#727680] hover:text-[#727680]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        종목 탐색으로 돌아가기
      </Link>
      <div className="flex flex-col justify-between gap-6 rounded-2xl border border-[#e6e8eb] bg-[#ffffff] p-6 sm:flex-row sm:items-center sm:p-8">
        <div>
          <div className="mb-6 flex items-center gap-4">
            <AssetAvatar symbol={quote.symbol} logoUrl={quote.logoUrl} />
            <div>
              <p className="text-xs uppercase tracking-wider text-[#727680]">
                {quote.symbol} · {quote.currency}
              </p>
              <h1 className="mt-1 text-xl font-semibold text-[#202329]">
                {quote.name}
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="text-4xl font-semibold tracking-tight text-[#202329]">
              {formatCurrency(quote.price, quote.currency)}
            </span>
            <PriceChange
              value={quote.change}
              percent={quote.changePercent}
              currency={quote.currency}
              size="lg"
            />
          </div>
          <QuoteStatus quote={quote} failed={failedSymbols.includes(symbol)} />
          <button type="button" onClick={refresh} disabled={refreshing}
            className="mt-3 inline-flex items-center gap-1.5 text-xs text-[#727680] disabled:opacity-50">
            <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
            30초 자동 갱신 · 새로고침
          </button>
        </div>
        <div className="flex flex-col items-start gap-3"><WatchStockButton key={quote.symbol} symbol={quote.symbol} name={quote.name}/><Link
          href={`/search?symbol=${encodeURIComponent(quote.symbol)}`}
          className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#25282e] px-5 py-3 text-sm font-medium text-[#ffffff] transition-colors hover:bg-[#25282e]"
        >
          <Plus className="h-4 w-4" />이 종목 거래 기록
        </Link></div>
      </div>

    </div>
  );
}

function StockStats({quote}:{quote:import("@/lib/types").StockQuote}) {
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

return <>
      <section className="rounded-2xl border border-[#e6e8eb] bg-[#ffffff] p-6 sm:p-7">
        <h2 className="mb-6 text-base font-semibold text-[#202329]">
          숫자로 보는 {quote.symbol}
        </h2>
        <dl className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label}>
              <dt className="text-xs text-[#727680]">{stat.label}</dt>
              <dd className="mt-2 text-base font-semibold text-[#202329]">
                {stat.value}
                {stat.suffix && (
                  <span className="ml-1 text-xs font-normal text-[#727680]">
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
        className="flex items-center justify-between gap-3 rounded-2xl border border-[#e6e8eb] bg-[#f3f4f6] p-5 text-[#727680]"
      >
        <div>
          <p className="text-sm font-semibold">
            이 기업에 투자하는 이유가 있나요?
          </p>
          <p className="mt-1 text-xs text-[#727680]">
            투자 노트에 생각을 남기고, 다음 선택의 기준으로 삼아보세요.
          </p>
        </div>
        <ArrowUpRight className="h-5 w-5 shrink-0" />
      </Link>

</>;
}
