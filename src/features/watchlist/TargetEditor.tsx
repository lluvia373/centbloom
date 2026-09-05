"use client";
import { type WatchlistItem } from "@/hooks/useWatchlist";
import { X } from "lucide-react";
import { useState } from "react";
const smallButton =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#e6e8eb] bg-[#ffffff] px-3 py-2 text-xs font-medium text-[#727680] transition hover:bg-[#f3f4f6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25282e] disabled:cursor-not-allowed disabled:opacity-40";
export function TargetEditor({
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
