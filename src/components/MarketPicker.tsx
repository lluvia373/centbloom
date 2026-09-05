"use client";

import { MARKETS, type MarketFilter } from "@/lib/markets";

export function MarketPicker({ value, onChange, includeAll = true }: {
  value: MarketFilter;
  onChange: (value: MarketFilter) => void;
  includeAll?: boolean;
}) {
  const options = includeAll ? [{ id: "all" as const, label: "전체" }, ...MARKETS] : MARKETS;
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="주식 시장 선택">
      {options.map((market) => (
        <button key={market.id} type="button" aria-pressed={value === market.id}
          onClick={() => onChange(market.id)}
          className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${value === market.id ? "bg-[#25282e] text-white" : "text-[#727680] hover:bg-[#f3f4f6]"}`}>
          {market.label}
        </button>
      ))}
    </div>
  );
}
