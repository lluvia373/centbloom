"use client";
import {
  addCalendarDays,
  buildSecuritiesReturnSeries,
  calculatePerformanceMetrics,
  findInactivePeriods,
} from "@/lib/performance";
import type { PortfolioPerformancePoint, Transaction } from "@/lib/types";
import { useMemo, useState } from "react";
import { useKstDate } from "@/shared/time/use-kst-date";
export const RANGES = [
  { key: "1d", label: "1일", days: 1 },
  { key: "5d", label: "5일", days: 5 },
  { key: "1m", label: "1개월", days: 30 },
  { key: "3m", label: "3개월", days: 90 },
  { key: "ytd", label: "올해" },
  { key: "1y", label: "1년", days: 365 },
  { key: "all", label: "전체" },
] as const;

export type RangeKey = (typeof RANGES)[number]["key"] | "custom";

export function usePerformanceRange(
  points: PortfolioPerformancePoint[],
  transactions: Transaction[],
) {
  const today = useKstDate();
  const [range, setRange] = useState<RangeKey>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const firstDate = points[0]?.date ?? transactions.map(tx => tx.date).sort()[0] ?? "";
  const lastDate = points.at(-1)?.date ?? (transactions.length ? today : "");
  const effectiveEnd = range === "1d" || range === "5d" ? today || lastDate
    : range === "custom" && customEnd ? customEnd : lastDate;
  const effectiveStart = useMemo(() => {
    if (!firstDate || !effectiveEnd) return "";
    if (range === "custom" && customStart) {
      return customStart < firstDate ? firstDate : customStart;
    }
    if (range === "1d") return effectiveEnd;
    if (range === "5d") return addCalendarDays(effectiveEnd, -4);
    if (range === "all") return firstDate;
    if (range === "ytd") {
      const ytd = `${effectiveEnd.slice(0, 4)}-01-01`;
      return ytd < firstDate ? firstDate : ytd;
    }
    const definition = RANGES.find((item) => item.key === range);
    const candidate =
      definition && "days" in definition
        ? addCalendarDays(effectiveEnd, -(definition.days - 1))
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
    () => buildSecuritiesReturnSeries(selectedPoints, transactions),
    [selectedPoints, transactions],
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
    selectedPoints.length > 0 &&
    selectedPoints.every((point) => !point.active) &&
    !transactions.some((transaction) =>
      transaction.date >= selectedPoints[0].date &&
      transaction.date <= selectedPoints[selectedPoints.length - 1].date,
    );

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
