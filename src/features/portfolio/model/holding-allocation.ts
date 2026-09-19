import type { HoldingWithQuote } from "@/lib/types";
import { matchesStockQuery } from "@/lib/markets";

export interface HoldingAllocationSegment {
  key: string;
  name: string;
  symbol: string;
  value: number;
  weight: number;
}

export const ALLOCATION_PAGE_SIZE = 14;

export function formatAllocationWeight(weight: number) {
  const rounded = weight.toFixed(1);
  return `${rounded === "0.0" ? "0" : rounded}%`;
}

export function getAllocationPage(
  segments: HoldingAllocationSegment[], query: string, page: number, pageSize = ALLOCATION_PAGE_SIZE,
) {
  const matches = segments.filter((segment) => matchesStockQuery(query, segment.symbol, segment.name));
  const size = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) || 1 : ALLOCATION_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(matches.length / size));
  const current = Math.min(pageCount - 1, Math.max(0, Number.isFinite(page) ? Math.trunc(page) : 0));
  const start = current * size;
  return { items: matches.slice(start, start + size), page: current, pageCount, total: matches.length, start };
}

export function buildHoldingAllocation(holdings: HoldingWithQuote[]) {
  const complete = holdings.length > 0 && holdings.every((holding) =>
    holding.valuationAvailable &&
    Number.isFinite(holding.displayMarketValue) &&
    holding.displayMarketValue >= 0,
  );
  const total = complete
    ? holdings.reduce((sum, holding) => sum + holding.displayMarketValue, 0)
    : 0;
  const available = complete && Number.isFinite(total) && total > 0;
  const weights: Record<string, number> = {};
  const segments: HoldingAllocationSegment[] = [];

  if (!available) return { available, complete, total, weights, segments };

  const sorted = [...holdings].sort((a, b) => b.displayMarketValue - a.displayMarketValue);
  for (const holding of sorted) weights[holding.id] = holding.displayMarketValue / total * 100;
  for (const holding of sorted) {
    segments.push({
      key: holding.id,
      name: holding.name,
      symbol: holding.symbol,
      value: holding.displayMarketValue,
      weight: weights[holding.id],
    });
  }
  return { available, complete, total, weights, segments };
}
