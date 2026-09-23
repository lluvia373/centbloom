"use client";
import { AssetAvatar } from "@/components/AssetAvatar";
import { MarketPicker } from "@/components/MarketPicker";
import { useStockSearch } from "@/features/market/use-stock-search";
import type { WatchlistItem } from "@/hooks/useWatchlist";
import { MARKETS, type MarketFilter } from "@/lib/markets";
import type { StockSearchResult } from "@/lib/types";
import { Check, LoaderCircle, Plus, Search, X } from "lucide-react";
import { useState, type RefObject } from "react";
const panel = "rounded-cf-card border border-cf-line bg-cf-surface";
export function WatchlistSearch({
  items,
  ready,
  addItem,
  setNotice,
  searchInput,
}: {
  items: WatchlistItem[];
  ready: boolean;
  addItem: (stock: StockSearchResult) => string | null | Promise<string | null>;
  setNotice: (message: string) => void;
  searchInput: RefObject<HTMLInputElement | null>;
}) {
  const [pending, setPending] = useState(false);
  const [query, setQuery] = useState("");
  const [searchMarket, setSearchMarket] = useState<MarketFilter>("all");
  const trimmedQuery = query.trim();
  const { loading: searching, ...searchState } = useStockSearch(query, {
    market: searchMarket,
    limit: 8,
  });
  return (
    <section className={`${panel} p-4 sm:p-6`} aria-label="관심종목 추가 검색">
      <div className="mb-3">
        <label htmlFor="watchlist-search" className="text-cf-label font-semibold">
          관심종목에 추가할 종목 검색
        </label>
      </div>
      <div className="flex items-center gap-3 rounded-cf-control border border-cf-line px-3 focus-within:outline-2 focus-within:outline-cf-focus">
        <Search
          className="shrink-0 text-cf-muted"
          size={16}
          aria-hidden="true"
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
              ? "종목명 또는 티커"
              : `종목 코드 예: ${MARKETS.find((entry) => entry.id === searchMarket)?.example}`
          }
          className="min-h-12 min-w-0 flex-1 bg-transparent text-cf-input text-cf-ink placeholder:text-cf-muted focus:outline-none"
        />
        {query ? (
          <button
            type="button"
            onClick={() => { setQuery(""); searchInput.current?.focus(); }}
            aria-label="검색어 지우기"
            className="inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-cf-control text-cf-muted hover:bg-cf-soft focus-visible:outline-2 focus-visible:outline-cf-focus"
          >
            <X size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className="mt-4">
        <MarketPicker value={searchMarket} onChange={setSearchMarket} />
      </div>
      {trimmedQuery ? (
        <div className="mt-3" aria-live="polite">
          {searching ? (
            <p role="status" className="flex items-center gap-2 py-4 text-cf-body text-cf-muted">
              <LoaderCircle className="animate-spin" size={16} aria-hidden="true" /> 종목 검색 중
            </p>
          ) : searchState.error ? (
            <p role="alert" className="py-4 text-cf-body text-cf-negative">
              {searchState.error}
            </p>
          ) : searchState.results.length ? (
            <div className="divide-y divide-cf-line">
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
                      <p className="truncate text-cf-body font-medium">
                        {stock.name}
                      </p>
                      <p className="mt-1 text-cf-caption text-cf-muted">
                        {stock.symbol}
                        <span className="mx-2">/</span>
                        {stock.exchange}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={added || !ready || pending}
                      aria-label={`${stock.name} 관심종목 ${pending ? "저장 중…" : added ? "추가됨" : "추가"}`}
                      onClick={async () => {
                        setPending(true);
                        const failure = await addItem(stock);
                        setPending(false);
                        setNotice(
                          failure ?? `${stock.name}을 관심종목에 추가했어요.`,
                        );
                        if (!failure) { setQuery(""); searchInput.current?.focus(); }
                      }}
                      className="button-secondary shrink-0"
                    >
                      {added ? <Check size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
                      {pending ? "저장 중…" : added ? "추가됨" : "추가"}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-4 text-cf-body text-cf-muted">
              검색 결과 없음
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
