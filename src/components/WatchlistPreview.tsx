"use client";

import { AssetAvatar } from "@/components/AssetAvatar";
import { formatWatchPrice,useWatchlist } from "@/hooks/useWatchlist";
import { ChevronRight,Plus,Star } from "lucide-react";
import Link from "next/link";

const samples = [
  {
    symbol: "MSFT",
    name: "Microsoft",
    price: 441.85,
    currency: "USD",
    change: -0.42,
  },
  {
    symbol: "AMZN",
    name: "Amazon",
    price: 186.49,
    currency: "USD",
    change: 1.24,
  },
  {
    symbol: "005930.KS",
    name: "삼성전자",
    price: 72400,
    currency: "KRW",
    change: 0.84,
  },
];

export function WatchlistPreview({ isDemo = false }: { isDemo?: boolean }) {
  const { items, quotes, ready, quotesLoading, error, failedSymbols } = useWatchlist({
    loadQuotes: !isDemo, quoteLimit: 3,
  });
  const rows = isDemo
    ? samples
    : items
        .slice(0, 3)
        .map((item) => ({
          symbol: item.symbol,
          name: item.name,
          price: quotes[item.symbol]?.price,
          currency: quotes[item.symbol]?.currency,
          change: quotes[item.symbol]?.changePercent,
        }));
  return (
    <section className="rounded-2xl border border-[#e9eaed] bg-[#ffffff] p-5 sm:p-6">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold tracking-tight text-[#202329]">
            관심종목
          </h2>
          {isDemo ? (
            <span className="rounded bg-[#f2f4f5] px-1.5 py-0.5 text-[11px] text-[#727680]">
              샘플
            </span>
          ) : null}
        </div>
        <Link
          href="/watchlist"
          aria-label="관심종목 모두 보기"
          className="rounded-lg p-1 text-[#727680] transition hover:bg-[#f6f7f8] hover:text-[#3b8879]"
        >
          <ChevronRight size={17} />
        </Link>
      </div>
      {!isDemo && !ready ? (
        <p className="py-10 text-center text-xs text-[#727680]">
          관심종목을 불러오고 있어요.
        </p>
      ) : rows.length ? (
        <div className="space-y-5">
          {rows.map((row) => (
            <div
              key={row.symbol}
              className="flex items-center justify-between gap-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <AssetAvatar symbol={row.symbol} logoUrl={quotes[row.symbol]?.logoUrl} />
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-[#202329]">
                    {row.name}
                  </p>
                  <p className="mt-1 text-[11px] text-[#727680]">
                    {row.symbol}
                  </p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                {row.price !== undefined && row.currency ? (
                  <>
                    <p className="text-xs font-semibold tabular-nums text-[#202329]">
                      {formatWatchPrice(row.price, row.currency)}
                    </p>
                    {row.change !== undefined && Number.isFinite(row.change) ? (
                      <p
                        className={`mt-1 text-[11px] tabular-nums ${row.change >= 0 ? "text-[#16856b]" : "text-[#d65353]"}`}
                      >
                        {row.change > 0 ? "+" : ""}
                        {row.change.toFixed(2)}%
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-[11px] text-[#727680]">
                    {quotesLoading ? "조회 중…" : "시세 확인 불가"}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-5 text-center">
          <Star
            className="mx-auto text-[#727680]"
            size={22}
            strokeWidth={1.5}
          />
          <p className="mt-3 text-xs text-[#727680]">
            관심종목 없음.
          </p>
        </div>
      )}
      {!isDemo && error ? (
        <p role="alert" className="mt-3 text-[11px] leading-5 text-[#946a24]">
          {error}
        </p>
      ) : null}
      {!isDemo && failedSymbols.length > 0 ? (
        <p role="status" className="mt-3 text-[11px] text-[#b46926]">일부 종목 갱신 실패 · 마지막 확인 가격을 표시합니다</p>
      ) : null}
      {!isDemo && items.length > 0 ? <p className="mt-3 text-[11px] text-[#727680]">30초 자동 갱신 · 지연 시세 포함</p> : null}
      <Link
        href="/watchlist"
        className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#e9eaed] py-2.5 text-[11px] font-medium text-[#727680] transition hover:bg-[#f6f7f8]"
      >
        {isDemo ? (
          <>
             나의 관심종목 만들기
          </>
        ) : (
          <>
            <Plus size={13} /> 관심종목 추가
          </>
        )}
      </Link>
      {isDemo ? (
        <p className="mt-3 text-center text-[11px] text-[#727680]">
          예시 가격이며 실제 시세가 아닙니다
        </p>
      ) : null}
    </section>
  );
}
