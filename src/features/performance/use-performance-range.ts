"use client";
import {
  addCalendarDays,
  calculatePerformanceMetrics,
  findInactivePeriods,
  normalizePerformancePoints,
} from "@/lib/performance";
import type { PortfolioPerformancePoint, Transaction } from "@/lib/types";
import { useMemo, useState } from "react";
export const RANGES = [
  { key: "1d", label: "1일", days: 1 },
  { key: "1w", label: "1주", days: 7 },
  { key: "1m", label: "1개월", days: 30 },
  { key: "3m", label: "3개월", days: 90 },
  { key: "6m", label: "6개월", days: 180 },
  { key: "ytd", label: "올해" },
  { key: "1y", label: "1년", days: 365 },
  { key: "all", label: "전체" },
] as const;

export type RangeKey = (typeof RANGES)[number]["key"] | "custom";

export function usePerformanceRange(
  points: PortfolioPerformancePoint[],
  transactions: Transaction[],
) {
  const [range, setRange] = useState<RangeKey>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const firstDate = points[0]?.date ?? "";
  const lastDate = points.at(-1)?.date ?? "";
  const effectiveEnd = range === "custom" && customEnd ? customEnd : lastDate;
  const effectiveStart = useMemo(() => {
    if (!firstDate || !effectiveEnd) return "";
    if (range === "custom" && customStart) {
      return customStart < firstDate ? firstDate : customStart;
    }
    if (range === "all") return firstDate;
    if (range === "ytd") {
      const ytd = `${effectiveEnd.slice(0, 4)}-01-01`;
      return ytd < firstDate ? firstDate : ytd;
    }
    const definition = RANGES.find((item) => item.key === range);
    const candidate =
      definition && "days" in definition
        ? addCalendarDays(effectiveEnd, -definition.days)
        : firstDate;
    return candidate < firstDate ? firstDate : candidate;
  }, [customStart, effectiveEnd, firstDate, range]);

  const selectedPoints = useMemo(
    () =>
      points.filter(
        (point) => point.date >= effectiveStart && point.date <= effectiveEnd,
      ),
    [effectiveEnd, effectiveStart, points],
  );
  const normalizedPoints = useMemo(
    () => normalizePerformancePoints(selectedPoints),
    [selectedPoints],
  );
  const metrics = useMemo(
    () =>
      calculatePerformanceMetrics(
        points,
        transactions,
        effectiveStart,
        effectiveEnd,
      ),
    [effectiveEnd, effectiveStart, points, transactions],
  );
  const inactivePeriods = useMemo(
    () => findInactivePeriods(selectedPoints),
    [selectedPoints],
  );
  const entirelyInactive =
    selectedPoints.length > 0 && selectedPoints.every((point) => !point.active);

  return {
    range,
    setRange,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    firstDate,
    lastDate,
    effectiveEnd,
    effectiveStart,
    selectedPoints,
    normalizedPoints,
    metrics,
    inactivePeriods,
    entirelyInactive,
  };
}
