"use client";

import { formatCurrency } from "@/lib/format";
import type { DayOHLC } from "@/lib/types";
import { useId } from "react";

interface PriceRangePickerProps {
  ohlc: DayOHLC;
  price: number;
  onChange: (price: number) => void;
}

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function lerp(min: number, max: number, t: number) {
  return min + (max - min) * t;
}

export function PriceRangePicker({
  ohlc,
  price,
  onChange,
}: PriceRangePickerProps) {
  const priceInputId = useId();
  const { open, close, currency } = ohlc;
  const low = roundToCents(ohlc.low);
  const high = roundToCents(ohlc.high);
  const range = high - low;
  const sliderValue =
    range > 0 ? clamp(((price - low) / range) * 100, 0, 100) : 50;

  const handleSlider = (pct: number) => {
    onChange(roundToCents(clamp(lerp(low, high, pct / 100), low, high)));
  };

  const handleInput = (raw: string) => {
    const num = Number(raw);
    if (!Number.isFinite(num)) return;
    onChange(num);
  };

  return (
    <div className="space-y-4 rounded-xl border border-[#e1e7e2] bg-[#f8faf7] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-medium text-[#526459]">당일 가격 범위</span>
        <span className="text-[#617365]">
          {formatCurrency(low, currency)} — {formatCurrency(high, currency)}
        </span>
      </div>

      <div className="relative pt-2">
        <div className="mb-1 flex justify-between text-[11px] text-[#617365]">
          <span>저가</span>
          <span>고가</span>
        </div>
        <input
          type="range"
          aria-label="당일 가격 범위에서 체결 단가 선택"
          disabled={range <= 0}
          min={0}
          max={100}
          step={0.1}
          value={sliderValue}
          onChange={(e) => handleSlider(parseFloat(e.target.value))}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gradient-to-r from-[#e9c9bc] via-[#dce5d9] to-[#84b29a] accent-[#236b50] disabled:cursor-default"
        />
        <div className="mt-2 flex justify-between text-xs">
          <span className="text-[#ab4e42]">
            {formatCurrency(low, currency)}
          </span>
          <span className="text-[#26764f]">
            {formatCurrency(high, currency)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg border border-[#edf0ed] bg-white px-3 py-2.5">
          <span className="text-[11px] text-[#617365]">시가</span>
          <p className="mt-1 font-medium text-[#1b2c26]">
            {formatCurrency(open, currency)}
          </p>
        </div>
        <div className="rounded-lg border border-[#edf0ed] bg-white px-3 py-2.5">
          <span className="text-[11px] text-[#617365]">종가</span>
          <p className="mt-1 font-medium text-[#1b2c26]">
            {formatCurrency(close, currency)}
          </p>
        </div>
      </div>

      <div>
        <label
          htmlFor={priceInputId}
          className="mb-2 block text-xs font-medium text-[#617365]"
        >
          체결 단가
        </label>
        <input
          id={priceInputId}
          type="number"
          min={low}
          max={high}
          step="any"
          value={price || ""}
          onChange={(e) => handleInput(e.target.value)}
          onBlur={() => onChange(roundToCents(clamp(price, low, high)))}
          required
          className="w-full rounded-xl border border-[#e1e7e2] bg-white px-4 py-3 text-sm text-[#1b2c26] outline-none transition focus:border-[#236b50] focus:ring-2 focus:ring-[#236b50]/10"
        />
        <p className="mt-2 text-[11px] leading-5 text-[#617365]">
          슬라이더로 당일 저가~고가 사이에서 선택하거나 직접 입력하세요.
        </p>
      </div>
    </div>
  );
}
