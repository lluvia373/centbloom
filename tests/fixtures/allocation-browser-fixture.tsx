"use client";

import { AllocationChart } from "@/components/AllocationChart";
import type { DisplayCurrency, HoldingWithQuote } from "@/lib/types";
import { useMemo, useState } from "react";

const COUNTS = [1, 13, 14, 15, 100, 101, 200];

function createHoldings(count: number, displayCurrency: DisplayCurrency): HoldingWithQuote[] {
  return Array.from({ length: count }, (_, index) => {
    const symbol = `TEST${String(index + 1).padStart(3, "0")}`;
    const value = count > 1 && index === count - 1 ? 0
      : count > 2 && index === count - 2 ? 0.01
        : (count - index) * 1000;
    const name = index === 0
      ? "International Diversified Technology Infrastructure and Investment Holdings Corporation Limited"
      : index === 2 || index === 3
        ? "Shared Enterprise Holdings Limited"
        : `Example Investment Corporation ${String(index + 1).padStart(3, "0")}`;
    return {
      id: symbol,
      symbol,
      name,
      quantity: 1,
      avgCost: value,
      currency: "KRW",
      addedAt: "2026-09-01T00:00:00Z",
      valuationAvailable: true,
      gainAvailable: true,
      marketValue: value,
      costBasis: value,
      gainLoss: 0,
      gainLossPercent: 0,
      marketValueKRW: value,
      resolvedCostBasisKRW: value,
      gainLossKRW: 0,
      gainLossPercentKRW: 0,
      marketValueUSD: value / 1300,
      resolvedCostBasisUSD: value / 1300,
      gainLossUSD: 0,
      gainLossPercentUSD: 0,
      displayMarketValue: displayCurrency === "KRW" ? value : value / 1300,
      displayCostBasis: displayCurrency === "KRW" ? value : value / 1300,
      displayGainLoss: 0,
      displayGainLossPercent: 0,
      stockPriceImpactKRW: 0,
      fxImpactKRW: 0,
    };
  });
}

export default function AllocationBrowserFixture() {
  const [count, setCount] = useState(101);
  const [width, setWidth] = useState(1120);
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>("KRW");
  const holdings = useMemo(() => createHoldings(count, displayCurrency), [count, displayCurrency]);

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ marginBottom: 16 }}>자산 구성 격리 검증</h1>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <label>
          종목 수{" "}
          <select aria-label="검증 종목 수" value={count} onChange={(event) => setCount(Number(event.target.value))}>
            {COUNTS.map((value) => <option key={value} value={value}>{value}종목</option>)}
          </select>
        </label>
        <label>
          화면 너비{" "}
          <select aria-label="검증 화면 너비" value={width} onChange={(event) => setWidth(Number(event.target.value))}>
            <option value={1120}>PC 1120px</option>
            <option value={390}>모바일 390px</option>
          </select>
        </label>
        <label>
          표시 통화{" "}
          <select aria-label="검증 표시 통화" value={displayCurrency}
            onChange={(event) => setDisplayCurrency(event.target.value as DisplayCurrency)}>
            <option value="KRW">KRW</option>
            <option value="USD">USD</option>
          </select>
        </label>
      </div>
      <p style={{ marginBottom: 16 }}>
        가상 자료 {count}종목 · TEST001부터 비중 내림차순 · 마지막 두 종목은 매우 작은 비중과 0원 · TEST003/004는 같은 회사명
      </p>
      <div data-testid="allocation-fixture-viewport" data-width={width} style={{ width, maxWidth: "none" }}>
        <AllocationChart holdings={holdings} displayCurrency={displayCurrency} />
      </div>
    </div>
  );
}
