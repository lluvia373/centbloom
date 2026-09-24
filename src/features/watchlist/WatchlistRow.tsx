"use client";
import { AssetAvatar } from "@/components/AssetAvatar";
import { QuoteStatus } from "@/components/QuoteStatus";
import { formatWatchPrice, type WatchlistItem } from "@/hooks/useWatchlist";
import type { StockQuote } from "@/lib/types";
import { ArrowDownRight, ArrowUpRight, Bell, Pencil, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { TargetEditor } from "./TargetEditor";
import { PriceAlertEditor } from "./PriceAlertEditor";
import { conditionReached, type PriceAlert, type PriceAlertInput } from "./price-alerts";
const smallButton =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#e6e8eb] bg-[#ffffff] px-3 py-2 text-xs font-medium text-[#727680] transition hover:bg-[#f3f4f6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25282e] disabled:cursor-not-allowed disabled:opacity-40";
export function WatchlistRow({
  item,
  quote,
  loading,
  failed,
  onRemove,
  onTarget,
  priceAlerts = [],
  pricesReady = false,
  pricesPending = false,
  onPrices,
  priceAccountScope,
}: {
  item: WatchlistItem;
  quote?: StockQuote;
  loading: boolean;
  failed: boolean;
  onRemove: () => string | null | Promise<string | null>;
  onTarget: (price: number | null, currency: string | null) => string | null | Promise<string | null>;
  priceAlerts?: PriceAlert[];
  pricesReady?: boolean;
  pricesPending?: boolean;
  onPrices?: (rules: PriceAlertInput[], requestId: string) => Promise<string | null>;
  priceAccountScope?: string;
}) {
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editingPrices, setEditingPrices] = useState(false);
  const priceButton = useRef<HTMLButtonElement>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currency = quote?.currency ?? item.targetCurrency ?? priceAlerts[0]?.currency;
  const targetComparable =
    !!quote &&
    !failed &&
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
      <div className="grid items-center gap-4 md:grid-cols-[minmax(180px,1.2fr)_minmax(130px,1fr)_minmax(155px,1fr)_152px]">
        <div className="flex min-w-0 items-center gap-3">
          <AssetAvatar symbol={item.symbol} logoUrl={quote?.logoUrl} />
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
                    className={`mt-1 flex items-center justify-end gap-0.5 text-xs tabular-nums md:justify-start ${change > 0 ? "text-cf-market-up" : change < 0 ? "text-cf-market-down" : "text-cf-muted"}`}
                  >
                    {change > 0 ? (
                      <ArrowUpRight size={13} />
                    ) : change < 0 ? (
                      <ArrowDownRight size={13} />
                    ) : null}
                    {change > 0 ? "+" : ""}
                    {change.toFixed(2)}%{" "}
                    <span className="ml-1 text-[#727680]">전일 대비</span>
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-[#727680]">
                    등락률 정보 없음
                  </p>
                )}
                <QuoteStatus quote={quote} failed={failed} />
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
                      : quote && !failed
                        ? "통화가 달라 목표가 확인 필요"
                        : "시세 확인 필요"}
                </p>
              </>
            ) : (
              <p className="text-xs text-[#727680]">미설정</p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-1">
          {onPrices && <button type="button" ref={priceButton} aria-label={`${item.name} 가격 알림 설정`}
            title={currency ? "가격 알림 설정" : "시세를 불러온 뒤 가격 알림을 설정할 수 있습니다"}
            aria-expanded={editingPrices} disabled={!currency || !pricesReady || pending}
            onClick={() => { setEditingPrices(!editingPrices); setEditing(false); setConfirmRemove(false); }}
            className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-cf-control text-cf-muted hover:bg-cf-soft focus-visible:outline-2 focus-visible:outline-cf-focus disabled:opacity-40">
            <Bell size={16} aria-hidden="true" />
          </button>}
          <button
            type="button"
            title={
              currency
                ? "목표 매수가 설정"
                : "시세를 불러온 뒤 목표가를 설정할 수 있습니다"
            }
            aria-label={`${item.name} 목표가 설정`}
            disabled={!currency || pending}
            onClick={() => {
              setEditing(!editing);
              setEditingPrices(false);
              setConfirmRemove(false);
            }}
            className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-cf-control text-cf-muted hover:bg-cf-soft focus-visible:outline-2 focus-visible:outline-cf-focus disabled:opacity-40"
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            disabled={pending}
            aria-label={`${item.name} 삭제`}
            onClick={() => {
              setConfirmRemove(!confirmRemove);
              setEditing(false);
              setEditingPrices(false);
            }}
            className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-cf-control text-cf-muted hover:bg-cf-soft hover:text-cf-negative focus-visible:outline-2 focus-visible:outline-cf-focus disabled:opacity-40"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      {priceAlerts.some(rule => rule.enabled) && <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-cf-caption text-cf-muted">
        {priceAlerts.filter(rule => rule.enabled).map(rule => {
          const state = conditionReached(rule, quote, failed);
          return <span key={rule.direction}>알림 {formatWatchPrice(rule.threshold, rule.currency)} {rule.direction === "below" ? "이하" : "이상"} · {state === null ? "시세 확인 대기" : state ? "현재 도달" : "도달 대기"}</span>;
        })}
      </div>}
      {editingPrices && currency && onPrices && <PriceAlertEditor symbol={item.symbol} currency={currency} rules={priceAlerts}
        accountScope={priceAccountScope} pending={pricesPending} onSave={onPrices} onClose={() => { setEditingPrices(false); priceButton.current?.focus(); }} />}
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
              disabled={pending}
              onClick={async () => {
                setPending(true);
                const failure = await onRemove();
                setPending(false);
                setError(failure);
                if (!failure) setConfirmRemove(false);
              }}
            >
              {pending ? "삭제 중…" : "삭제"}
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
