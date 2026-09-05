"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleAlert,
  Crosshair,
  ListPlus,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import {
  formatWatchPrice,
  useWatchlist,
  type WatchlistItem,
} from "@/hooks/useWatchlist";
import { searchStocks } from "@/lib/stock-api";
import type { StockQuote, StockSearchResult } from "@/lib/types";

const panel = "rounded-2xl border border-[#e6e8eb] bg-[#ffffff]";
const smallButton =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#e6e8eb] bg-[#ffffff] px-3 py-2 text-xs font-medium text-[#727680] transition hover:bg-[#f3f4f6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25282e] disabled:cursor-not-allowed disabled:opacity-40";

function TargetEditor({
  item,
  currency,
  onSave,
  onClose,
}: {
  item: WatchlistItem;
  currency: string;
  onSave: (price: number | null, currency: string | null) => string | null;
  onClose: () => void;
}) {
  const [price, setPrice] = useState(
    item.targetCurrency === currency ? String(item.targetPrice ?? "") : "",
  );
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = price.trim() ? Number(price) : null;
        if (parsed !== null && (!Number.isFinite(parsed) || parsed <= 0)) {
          setError("0보다 큰 가격을 입력해 주세요.");
          return;
        }
        const failure = onSave(parsed, parsed === null ? null : currency);
        if (failure) setError(failure);
        else onClose();
      }}
      className="mt-4 rounded-xl bg-[#ffffff] p-4"
    >
      <label
        htmlFor={`target-${item.symbol}`}
        className="text-xs font-semibold text-[#727680]"
      >
        목표 매수가 (
        {currency === "GBp" || currency === "GBX" ? "영국 펜스" : currency})
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          autoFocus
          id={`target-${item.symbol}`}
          inputMode="decimal"
          type="number"
          min="0.000001"
          step="any"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          placeholder="비워두면 목표가 해제"
          className="min-w-0 flex-1 rounded-lg border border-[#e6e8eb] bg-[#ffffff] px-3 py-2 text-sm outline-none focus:border-[#9b9fa7]"
        />
        <button
          type="submit"
          className="rounded-lg bg-[#25282e] px-3 py-2 text-xs font-semibold text-[#ffffff] hover:bg-[#25282e]"
        >
          저장
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="목표가 편집 취소"
          className={smallButton}
        >
          <X size={15} />
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-[#d65353]">
          {error}
        </p>
      ) : (
        <p className="mt-2 text-xs leading-5 text-[#727680]">
          이 가격 이하일 때 도달로 표시합니다. 별도 알림은 발송되지 않아요.
        </p>
      )}
    </form>
  );
}

function WatchlistRow({
  item,
  quote,
  loading,
  onRemove,
  onTarget,
}: {
  item: WatchlistItem;
  quote?: StockQuote;
  loading: boolean;
  onRemove: () => string | null;
  onTarget: (price: number | null, currency: string | null) => string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currency = quote?.currency ?? item.targetCurrency;
  const targetComparable =
    !!quote &&
    item.targetPrice !== null &&
    item.targetCurrency === quote.currency;
  const reached = targetComparable && quote!.price <= item.targetPrice!;
  const change =
    quote && Number.isFinite(quote.changePercent) ? quote.changePercent : null;
  const aboveTarget = targetComparable
    ? ((quote!.price - item.targetPrice!) / quote!.price) * 100
    : null;
  return (
    <article className="border-t border-[#e6e8eb] p-5 first:border-t-0 sm:px-6">
      <div className="grid items-center gap-4 md:grid-cols-[minmax(180px,1.2fr)_minmax(130px,1fr)_minmax(155px,1fr)_auto]">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f3f4f6] text-sm font-bold text-[#727680]">
            {item.symbol.slice(0, 2)}
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-[#202329]">
              {item.name}
            </h3>
            <p className="mt-1 text-xs text-[#727680]">{item.symbol}</p>
          </div>
        </div>
        <div className="flex items-center justify-between md:block">
          <p className="text-xs text-[#727680] md:hidden">현재가</p>
          <div className="text-right md:text-left">
            {quote ? (
              <>
                <p className="text-[16px] font-semibold tabular-nums text-[#202329]">
                  {formatWatchPrice(quote.price, quote.currency)}
                </p>
                {change !== null ? (
                  <p
                    className={`mt-1 flex items-center justify-end gap-0.5 text-xs tabular-nums md:justify-start ${change >= 0 ? "text-[#16856b]" : "text-[#d65353]"}`}
                  >
                    {change >= 0 ? (
                      <ArrowUpRight size={13} />
                    ) : (
                      <ArrowDownRight size={13} />
                    )}
                    {change > 0 ? "+" : ""}
                    {change.toFixed(2)}%{" "}
                    <span className="ml-1 text-[#727680]">전일 대비</span>
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-[#727680]">
                    등락률 정보 없음
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-[#727680]">
                {loading ? "시세 불러오는 중…" : "시세를 불러오지 못했어요"}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between md:block">
          <p className="text-xs text-[#727680] md:hidden">목표 매수가</p>
          <div className="text-right md:text-left">
            {item.targetPrice !== null && item.targetCurrency ? (
              <>
                <p className="text-sm font-semibold tabular-nums text-[#727680]">
                  {formatWatchPrice(item.targetPrice, item.targetCurrency)}
                </p>
                <p
                  className={`mt-1 text-xs ${reached ? "font-medium text-[#727680]" : "text-[#727680]"}`}
                >
                  {reached
                    ? "✓ 목표가 도달"
                    : aboveTarget !== null
                      ? `목표까지 ${aboveTarget.toFixed(1)}% 하락 필요`
                      : quote
                        ? "통화가 달라 목표가 확인 필요"
                        : "시세 확인 후 비교할 수 있어요"}
                </p>
              </>
            ) : (
              <p className="text-xs text-[#727680]">아직 설정하지 않았어요</p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-1">
          <button
            type="button"
            title={
              currency
                ? "목표 매수가 설정"
                : "시세를 불러온 뒤 목표가를 설정할 수 있습니다"
            }
            aria-label={`${item.name} 목표가 설정`}
            disabled={!currency}
            onClick={() => {
              setEditing(!editing);
              setConfirmRemove(false);
            }}
            className="rounded-lg p-2 text-[#727680] hover:bg-[#f3f4f6] hover:text-[#727680] disabled:opacity-30"
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            aria-label={`${item.name} 삭제`}
            onClick={() => {
              setConfirmRemove(!confirmRemove);
              setEditing(false);
            }}
            className="rounded-lg p-2 text-[#727680] hover:bg-[#ffffff] hover:text-[#d65353]"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      {editing && currency ? (
        <TargetEditor
          item={item}
          currency={currency}
          onSave={onTarget}
          onClose={() => setEditing(false)}
        />
      ) : null}
      {confirmRemove ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#ffffff] px-4 py-3">
          <p className="text-xs text-[#d65353]">
            {item.name}을 관심종목에서 삭제할까요?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className={smallButton}
              onClick={() => setConfirmRemove(false)}
            >
              취소
            </button>
            <button
              type="button"
              className="rounded-lg bg-[#f7e9e9] px-3 py-2 text-xs font-semibold text-[#a73d3d]"
              onClick={() => {
                const failure = onRemove();
                if (failure) setError(failure);
              }}
            >
              삭제
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-xs text-[#d65353]">
          {error}
        </p>
      ) : null}
    </article>
  );
}

export default function WatchlistPage() {
  const {
    items,
    ready,
    error,
    addItem,
    removeItem,
    setTarget,
    quotes,
    quotesLoading,
    failedSymbols,
    refreshQuotes,
  } = useWatchlist();
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState<{
    query: string;
    results: StockSearchResult[];
    error: string | null;
  }>({ query: "", results: [], error: null });
  const [notice, setNotice] = useState<string | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const trimmedQuery = query.trim();
  const searching = !!trimmedQuery && searchState.query !== trimmedQuery;
  const reached = items.filter(
    (item) =>
      item.targetPrice !== null &&
      quotes[item.symbol] &&
      quotes[item.symbol].currency === item.targetCurrency &&
      quotes[item.symbol].price <= item.targetPrice,
  ).length;
  const unknownTargets = items.some(
    (item) =>
      item.targetPrice !== null &&
      (!quotes[item.symbol] ||
        quotes[item.symbol].currency !== item.targetCurrency),
  );
  const targets = items.filter((item) => item.targetPrice !== null).length;

  useEffect(() => {
    if (!trimmedQuery) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void searchStocks(trimmedQuery)
        .then((results) => {
          if (!cancelled)
            setSearchState({
              query: trimmedQuery,
              results: results.slice(0, 8),
              error: null,
            });
        })
        .catch(() => {
          if (!cancelled)
            setSearchState({
              query: trimmedQuery,
              results: [],
              error:
                "검색 결과를 불러오지 못했습니다. 잠시 후 다시 검색해 주세요.",
            });
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [trimmedQuery]);

  return (
    <div className="mx-auto max-w-[1400px] space-y-7 text-[#202329]">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
            <h1 className="text-[28px] font-semibold tracking-[-0.04em] sm:text-[32px]">
            기다림에도, 나만의 기준을.
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#727680]">
            관심 있는 기업을 모으고, 사고 싶은 가격을 기록해 보세요.
          </p>
        </div>
        <button
          type="button"
          onClick={() => searchInput.current?.focus()}
          className="inline-flex items-center gap-2 rounded-xl bg-[#25282e] px-4 py-3 text-sm font-semibold text-[#ffffff] shadow-sm transition hover:bg-[#25282e]"
        >
          <Plus size={17} /> 관심종목 추가
        </button>
      </header>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[
          {
            label: "지켜보는 종목",
            value: items.length,
            unit: "개",
            icon: Star,
          },
          {
            label: "설정한 목표가",
            value: targets,
            unit: "개",
            icon: Crosshair,
          },
          {
            label: "목표가에 도달한 종목",
            value: quotesLoading || unknownTargets ? "—" : reached,
            unit: "개",
            icon: Check,
          },
        ].map(({ label, value, unit, icon: Icon }) => (
          <section
            key={label}
            className={`${panel} flex items-center justify-between p-3.5 sm:p-5`}
          >
            <div>
              <p className="min-h-8 text-xs leading-4 text-[#727680] sm:min-h-0 sm:text-xs">
                {label}
              </p>
              <p className="mt-2 text-[24px] font-semibold leading-none tracking-tight sm:mt-3 sm:text-[26px]">
                {ready ? value : "—"}
                <span className="ml-1.5 text-xs font-normal text-[#727680]">
                  {unit}
                </span>
              </p>
            </div>
            <span className="hidden h-10 w-10 items-center justify-center rounded-xl bg-[#f3f4f6] text-[#727680] sm:flex">
              <Icon size={18} strokeWidth={1.7} />
            </span>
          </section>
        ))}
      </div>

      <section className={`${panel} p-5 sm:p-6`} aria-label="관심종목 검색">
        <div className="mb-3 flex items-center justify-between gap-3">
          <label htmlFor="watchlist-search" className="text-sm font-semibold">
            다음으로 지켜볼 기업은?
          </label>
          <span className="text-xs text-[#727680]">
            한국 · 미국 · 글로벌
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
            placeholder="기업명 또는 티커 검색 · 예: 삼성전자, AAPL"
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
                      <div className="min-w-0">
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

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-[#e6e8eb] bg-[#ffffff] p-4 text-[13px] leading-6 text-[#d65353]"
        >
          <CircleAlert className="mt-1 shrink-0" size={16} />
          {error}
        </div>
      ) : null}
      {notice ? (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-xl bg-[#f3f4f6] px-4 py-3 text-xs text-[#727680]"
        >
          <span>{notice}</span>
          <button
            type="button"
            aria-label="메시지 닫기"
            onClick={() => setNotice(null)}
          >
            <X size={14} />
          </button>
        </div>
      ) : null}

      <section className={`${panel} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e6e8eb] p-5 sm:px-6">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold">내 관심종목</h2>
            <span className="rounded-md bg-[#f3f4f6] px-1.5 py-0.5 text-xs font-semibold text-[#727680]">
              {items.length}
            </span>
          </div>
          <button
            type="button"
            onClick={refreshQuotes}
            disabled={!items.length || quotesLoading}
            className="inline-flex items-center gap-1.5 text-xs text-[#727680] hover:text-[#727680] disabled:opacity-40"
          >
            <RefreshCw
              size={13}
              className={quotesLoading ? "animate-spin" : ""}
            />{" "}
            시세 새로고침
          </button>
        </div>
        {!ready ? (
          <p className="p-12 text-center text-sm text-[#727680]">
            저장된 관심종목을 불러오고 있어요.
          </p>
        ) : items.length ? (
          <>
            <div className="hidden grid-cols-[minmax(180px,1.2fr)_minmax(130px,1fr)_minmax(155px,1fr)_72px] gap-4 border-b border-[#e6e8eb] bg-[#ffffff] px-6 py-3 text-xs text-[#727680] md:grid">
              <span>종목</span>
              <span>현재가 · 전일 대비</span>
              <span>목표 매수가</span>
              <span className="text-right">관리</span>
            </div>
            {items.map((item) => (
              <WatchlistRow
                key={item.symbol}
                item={item}
                quote={quotes[item.symbol]}
                loading={quotesLoading}
                onRemove={() => removeItem(item.symbol)}
                onTarget={(price, currency) =>
                  setTarget(item.symbol, price, currency)
                }
              />
            ))}
          </>
        ) : (
          <div className="flex flex-col items-center px-5 py-16 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-[#f3f4f6] text-[#727680]">
              <ListPlus size={27} strokeWidth={1.5} />
            </span>
            <h3 className="mt-5 text-base font-semibold">
              좋은 투자는 관심에서 시작하니까.
            </h3>
            <p className="mt-2 max-w-xs text-[13px] leading-6 text-[#727680]">
              눈여겨보던 기업을 검색해 추가해 보세요.
              <br />
              목표가와 현재가를 한곳에서 비교할 수 있어요.
            </p>
            <button
              type="button"
              onClick={() => searchInput.current?.focus()}
              className="mt-5 flex items-center gap-1 text-xs font-semibold text-[#727680]"
            >
              첫 관심종목 추가하기 <ChevronRight size={14} />
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e6e8eb] bg-[#ffffff] px-5 py-3.5 text-xs leading-5 text-[#727680] sm:px-6">
          <span>이 브라우저에 저장된 나의 관심종목 · 최대 50개</span>
          <span>
            {failedSymbols.length
              ? `${failedSymbols.length}개 종목의 시세를 확인하지 못했어요.`
              : "시세는 지연될 수 있습니다. 목표가 도달 시 별도 알림은 발송되지 않습니다."}
          </span>
        </div>
      </section>
    </div>
  );
}
