"use client";

import { WatchlistRow } from "@/features/watchlist/WatchlistRow";
import { WatchlistSearch } from "@/features/watchlist/WatchlistSearch";
import { useWatchlist } from "@/hooks/useWatchlist";
import {
  Check,
  CircleAlert,
  Crosshair,
  ListPlus,
  Plus,
  RefreshCw,
  Star,
  X,
} from "lucide-react";
import { useRef, useState } from "react";

const panel = "rounded-2xl border border-[#e6e8eb] bg-[#ffffff]";

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
    <div className="mx-auto max-w-[1400px] space-y-7 text-[#202329]">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-cf-title font-semibold">
            관심종목
          </h1>

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

      <WatchlistSearch
        items={items}
        ready={ready}
        addItem={addItem}
        setNotice={setNotice}
        searchInput={searchInput}
      />

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
            disabled={!items.length || quotesRefreshing}
            className="inline-flex items-center gap-1.5 text-xs text-[#727680] hover:text-[#727680] disabled:opacity-40"
          >
            <RefreshCw
              size={13}
              className={quotesRefreshing ? "animate-spin" : ""}
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
                failed={failedSymbols.includes(item.symbol)}
                onRemove={() => removeItem(item.symbol)}
                onTarget={(price, currency) =>
                  setTarget(item.symbol, price, currency)
                }
              />
            ))}
          </>
        ) : (
          <div className="flex flex-col items-center px-4 py-8 text-center">
            <ListPlus size={24} className="text-cf-muted" aria-hidden="true" />
            <h3 className="mt-4 text-cf-body font-semibold">
              관심종목 없음
            </h3>


          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e6e8eb] bg-[#ffffff] px-5 py-3.5 text-xs leading-5 text-[#727680] sm:px-6">
          <span>이 브라우저에 저장된 나의 관심종목 · 최대 50개</span>
          <span>
            {failedSymbols.length
              ? `${failedSymbols.length}개 종목의 시세를 확인하지 못했어요.`
              : "30초 자동 갱신 · 거래소별 지연 시세 · 목표가 푸시 알림 없음"}
          </span>
        </div>
      </section>
    </div>
  );
}
