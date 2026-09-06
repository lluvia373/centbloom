"use client";
import { AssetAvatar } from "@/components/AssetAvatar";
import { MarketPicker } from "@/components/MarketPicker";
import { useStockSearch } from "@/features/market/use-stock-search";
import { discoveryStocks, MARKETS, type MarketFilter } from "@/lib/markets";
import type { StockSearchResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  Check,
  CircleHelp,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
const inputClass =
  "w-full rounded-xl border border-[#e6e8eb] bg-[#ffffff] px-4 py-3 text-sm text-[#202329] outline-none transition focus:border-[#9b9fa7] focus:ring-2 focus:ring-[#25282e]/10";
export function TradeStockPicker({
  selected,
  chooseStock,
  initialSymbol,
}: {
  selected: StockSearchResult | null;
  chooseStock: (stock: StockSearchResult) => void;
  initialSymbol: string;
}) {
  const [query, setQuery] = useState(initialSymbol);
  const [searchMarket, setSearchMarket] = useState<MarketFilter>("all");
  const [retry, setRetry] = useState(0);
  const {
    results,
    loading: searchLoading,
    error: searchError,
  } = useStockSearch(query, { market: searchMarket, retry });
  const stocksToShow = query.trim() ? results : discoveryStocks(searchMarket);
  useEffect(() => {
    if (query !== initialSymbol || selected) return;
    const exact = results.find(
      (stock) => stock.symbol.toUpperCase() === initialSymbol.toUpperCase(),
    );
    if (exact) chooseStock(exact);
  }, [query, initialSymbol, selected, results, chooseStock]);
  return (
    <section className="overflow-hidden rounded-2xl border border-[#e6e8eb] bg-[#ffffff]">
      <div className="border-b border-[#e6e8eb] p-6 sm:p-7">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f3f4f6] text-xs font-semibold text-[#727680]">
            01
          </span>
          <h2 className="text-base font-semibold text-[#202329]">
            종목 검색
          </h2>
        </div>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#727680]" />
          <input
            aria-label="종목 검색"
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            placeholder="기업명 또는 티커로 검색"
            className={cn(inputClass, "bg-[#ffffff] py-3.5 pl-11 pr-10")}
          />
          {query && (
            <button
              type="button"
              aria-label="검색어 지우기"
              onClick={() => {
                setQuery("");
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-[#727680] hover:bg-[#f3f4f6]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="mt-3 text-xs text-[#727680]">
          {searchMarket === "all"
            ? "종목 코드 예: AAPL"
            : `종목 코드 예: ${MARKETS.find((entry) => entry.id === searchMarket)?.example}`}
        </p>
        <div className="mt-4">
          <MarketPicker
            value={searchMarket}
            onChange={(value) => {
              setSearchMarket(value);
            }}
          />
        </div>
      </div>
      <div className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between px-2">
          <h3 className="text-xs font-medium text-[#727680]">
            {query.trim() ? "검색 결과" : "빠르게 찾아보기"}
          </h3>
          <span className="text-xs uppercase tracking-wider text-[#727680]">
            STOCKS & ETFS
          </span>
        </div>
        <div aria-live="polite" className="min-h-56">
          {searchLoading ? (
            <div className="flex items-center justify-center py-20 text-sm text-[#727680]">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              종목을 찾고 있어요
            </div>
          ) : searchError ? (
            <div className="p-8 text-center">
              <p className="text-sm leading-6 text-[#727680]">{searchError}</p>
              <button
                type="button"
                onClick={() => setRetry((value) => value + 1)}
                className="mt-4 text-sm font-medium text-[#727680]"
              >
                다시 검색하기
              </button>
            </div>
          ) : stocksToShow.length === 0 ? (
            <div className="py-16 text-center">
              <Search className="mx-auto mb-3 h-7 w-7 text-[#727680]" />
              <p className="text-sm text-[#727680]">
                검색 결과가 없어요. 다른 기업명이나 티커를 입력해 보세요.
              </p>
            </div>
          ) : (
            stocksToShow.map((stock) => (
              <button
                key={stock.symbol}
                type="button"
                onClick={() => chooseStock(stock)}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors",
                  selected?.symbol === stock.symbol
                    ? "bg-[#f3f4f6]"
                    : "hover:bg-[#ffffff]",
                )}
              >
                <AssetAvatar symbol={stock.symbol} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-[#202329]">
                    {stock.name}
                  </span>
                  <span className="mt-1 block text-xs text-[#727680]">
                    {stock.symbol}{" "}
                    <span className="mx-1.5 text-[#727680]">·</span>{" "}
                    {stock.exchange}
                  </span>
                </span>
                {selected?.symbol === stock.symbol ? (
                  <Check className="h-4 w-4 text-[#727680]" />
                ) : (
                  <ArrowRight className="h-4 w-4 text-[#727680] group-hover:text-[#727680]" />
                )}
              </button>
            ))
          )}
        </div>
      </div>
      <div className="flex items-start gap-2 border-t border-[#e6e8eb] bg-[#ffffff] px-6 py-4 text-xs leading-5 text-[#727680]">
        <CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        거래 기록용 앱입니다. 실제 주식 주문은 증권사에서 진행해 주세요.
      </div>
    </section>
  );
}
