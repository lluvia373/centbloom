"use client";

import { WatchlistRow } from "@/features/watchlist/WatchlistRow";
import { WatchlistSearch } from "@/features/watchlist/WatchlistSearch";
import { useWatchlist } from "@/hooks/useWatchlist";
import {
  Check,
  CircleAlert,
  Crosshair,
  Plus,
  RefreshCw,
  Star,
  X,
} from "lucide-react";
import { useRef, useState } from "react";

const panel = "rounded-cf-card border border-cf-line bg-cf-surface";

export default function WatchlistPage() {
  const {
    items,
    ready,
    error,
    pending,
    refreshing,
    refresh,
    addItem,
    removeItem,
    setTarget,
    quotes,
    quotesLoading,
    quotesRefreshing,
    failedSymbols,
    refreshQuotes,
  } = useWatchlist();
  const [notice, setNotice] = useState<string | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  const reached = items.filter(
    (item) =>
      item.targetPrice !== null &&
      quotes[item.symbol] &&
      !failedSymbols.includes(item.symbol) &&
      quotes[item.symbol].currency === item.targetCurrency &&
      quotes[item.symbol].price <= item.targetPrice,
  ).length;
  const unknownTargets = items.some(
    (item) =>
      item.targetPrice !== null &&
      (!quotes[item.symbol] ||
        failedSymbols.includes(item.symbol) ||
        quotes[item.symbol].currency !== item.targetCurrency),
  );
  const targets = items.filter((item) => item.targetPrice !== null).length;

  return (
    <div className="space-y-6 text-cf-ink">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-cf-title font-semibold">관심종목</h1>
        <button
          type="button"
          onClick={() => searchInput.current?.focus()}
          className="button-primary"
        >
          <Plus size={16} aria-hidden="true" /> 관심종목 추가
        </button>
      </header>

      {ready && items.length > 0 && <div className="grid grid-cols-3 gap-2 sm:gap-3">
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
            className={`${panel} flex items-center justify-between gap-2 p-3 sm:p-4`}
          >
            <div>
              <p className="text-cf-caption text-cf-muted">
                {label}
              </p>
              <p className="mt-2 text-cf-title font-semibold tabular-nums">
                {ready ? value : "—"}
                <span className="ml-1 text-cf-caption font-normal text-cf-muted">
                  {unit}
                </span>
              </p>
            </div>
            <span className="hidden text-cf-muted sm:flex" aria-hidden="true">
              <Icon size={16} />
            </span>
          </section>
        ))}
      </div>}

      <WatchlistSearch
        items={items}
        ready={ready && !pending}
        addItem={addItem}
        setNotice={setNotice}
        searchInput={searchInput}
      />

      {error ? (
        <div
          role="alert"
          className={`${panel} flex flex-wrap items-center gap-2 p-4 text-cf-label text-cf-negative`}
        >
          <CircleAlert className="shrink-0" size={16} aria-hidden="true" />
          <span>{error}</span>
          <button type="button" className="button-secondary" disabled={pending || refreshing} onClick={() => void refresh()}>다시 불러오기</button>
        </div>
      ) : null}
      {pending ? <p role="status" className="text-cf-caption text-cf-muted">저장 중…</p> : null}
      {notice ? (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-cf-control bg-cf-soft px-4 py-3 text-cf-caption text-cf-muted"
        >
          <span>{notice}</span>
          <button
            type="button"
            aria-label="메시지 닫기"
            onClick={() => setNotice(null)}
            className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-cf-control focus-visible:outline-2 focus-visible:outline-cf-focus"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {(!error || ready && items.length > 0) && <section className={`${panel} overflow-hidden`} aria-label="관심종목 목록">
        {ready && items.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cf-line p-4 sm:px-6">
          <h2 className="text-cf-body font-semibold">내 관심종목</h2>
          <button
            type="button"
            onClick={refreshQuotes}
            disabled={!items.length || quotesRefreshing}
            className="button-secondary"
          >
            <RefreshCw
              size={16}
              className={quotesRefreshing ? "animate-spin" : ""}
              aria-hidden="true"
            />{" "}
            시세 새로고침
          </button>
        </div>}
        {!ready ? (
          <p role="status" className="p-8 text-center text-cf-body text-cf-muted">
            관심종목 불러오는 중
          </p>
        ) : items.length ? (
          <>
            <div className="hidden grid-cols-[minmax(180px,1.2fr)_minmax(130px,1fr)_minmax(155px,1fr)_72px] gap-4 border-b border-cf-line px-6 py-3 text-cf-caption text-cf-muted md:grid">
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
                failed={failedSymbols.includes(item.symbol)}
                onRemove={() => removeItem(item.symbol)}
                onTarget={(price, currency) =>
                  setTarget(item.symbol, price, currency)
                }
              />
            ))}
          </>
        ) : error ? null : (
          <p className="p-8 text-center text-cf-body text-cf-muted">관심종목 없음</p>
        )}
        {ready && items.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-cf-line px-4 py-3 text-cf-caption text-cf-muted sm:px-6">
          <span>최대 50개</span>
          <span>
            {failedSymbols.length
              ? `${failedSymbols.length}개 종목의 시세를 확인하지 못했어요.`
              : "지연 시세 가능 · 목표가 알림 없음"}
          </span>
        </div>}
      </section>}
    </div>
  );
}
