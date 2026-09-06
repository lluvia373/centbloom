"use client";
import { AssetAvatar } from "@/components/AssetAvatar";
import { MarketPicker } from "@/components/MarketPicker";
import { useStockSearch } from "@/features/market/use-stock-search";
import type { WatchlistItem } from "@/hooks/useWatchlist";
import { MARKETS, type MarketFilter } from "@/lib/markets";
import type { StockSearchResult } from "@/lib/types";
import { Check, LoaderCircle, Plus, Search, X } from "lucide-react";
import { useState, type RefObject } from "react";
const panel = "rounded-2xl border border-[#e6e8eb] bg-[#ffffff]";
const smallButton =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#e6e8eb] bg-[#ffffff] px-3 py-2 text-xs font-medium text-[#727680] transition hover:bg-[#f3f4f6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25282e] disabled:cursor-not-allowed disabled:opacity-40";
export function WatchlistSearch({
  items,
  ready,
  addItem,
  setNotice,
  searchInput,
}: {
  items: WatchlistItem[];
  ready: boolean;
  addItem: (stock: StockSearchResult) => string | null;
  setNotice: (message: string) => void;
  searchInput: RefObject<HTMLInputElement | null>;
}) {
  const [query, setQuery] = useState("");
  const [searchMarket, setSearchMarket] = useState<MarketFilter>("all");
  const trimmedQuery = query.trim();
  const { loading: searching, ...searchState } = useStockSearch(query, {
    market: searchMarket,
    limit: 8,
  });
  return (
    <section className={`${panel} p-5 sm:p-6`} aria-label="관심종목 검색">
      <div className="mb-3 flex items-center justify-between gap-3">
        <label htmlFor="watchlist-search" className="text-sm font-semibold">
          종목 검색
        </label>
        <span className="text-xs text-[#727680]">
          한국 · 미국 · 일본 · 홍콩 · 중국
        </span>
      </div>
      <div className="relative">
        <Search
          className="absolute left-4 top-1/2 -translate-y-1/2 text-[#727680]"
          size={18}
        />
        <input
          ref={searchInput}
          id="watchlist-search"
          autoComplete="off"
          maxLength={80}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            searchMarket === "all"
              ? "기업명 또는 티커 · 삼성전자, 토요타, 텐센트"
              : `종목 코드 예: ${MARKETS.find((entry) => entry.id === searchMarket)?.example}`
          }
          className="w-full rounded-xl border border-[#e6e8eb] bg-[#ffffff] py-3.5 pl-11 pr-11 text-sm placeholder:text-[#727680] focus:border-[#9b9fa7] focus:bg-[#ffffff] focus:outline-none"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="검색어 지우기"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-[#727680] hover:bg-[#f3f4f6]"
          >
            <X size={16} />
          </button>
        ) : null}
      </div>
      <div className="mt-4">
        <MarketPicker value={searchMarket} onChange={setSearchMarket} />
      </div>
      {trimmedQuery ? (
        <div className="mt-3" aria-live="polite">
          {searching ? (
            <p className="flex items-center gap-2 py-4 text-sm text-[#727680]">
              <LoaderCircle className="animate-spin" size={16} /> 종목을 찾고
              있어요.
            </p>
          ) : searchState.error ? (
            <p role="alert" className="py-4 text-sm text-[#d65353]">
              {searchState.error}
            </p>
          ) : searchState.results.length ? (
            <div className="divide-y divide-[#e6e8eb]">
              {searchState.results.map((stock) => {
                const added = items.some(
                  (item) => item.symbol === stock.symbol,
                );
                return (
                  <div
                    key={stock.symbol}
                    className="flex items-center justify-between gap-4 py-3"
                  >
                    <AssetAvatar symbol={stock.symbol} small />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {stock.name}
                      </p>
                      <p className="mt-0.5 text-xs text-[#727680]">
                        {stock.symbol}
                        <span className="mx-2 text-[#727680]">/</span>
                        {stock.exchange}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={added || !ready}
                      aria-label={`${stock.name} 관심종목 ${added ? "추가됨" : "추가"}`}
                      onClick={() => {
                        const failure = addItem(stock);
                        setNotice(
                          failure ?? `${stock.name}을 관심종목에 추가했어요.`,
                        );
                        if (!failure) setQuery("");
                      }}
                      className={smallButton}
                    >
                      {added ? <Check size={14} /> : <Plus size={14} />}
                      {added ? "추가됨" : "추가"}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-4 text-sm text-[#727680]">
              검색된 종목이 없어요. 기업명이나 정확한 티커로 다시 찾아보세요.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
