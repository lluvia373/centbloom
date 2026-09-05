"use client";
import { useState } from "react";
import { CircleDot } from "lucide-react";
import { ASSET_COLORS } from "@/lib/demo";
import { formatCurrency } from "@/lib/format";
import type { DisplayCurrency, HoldingWithQuote } from "@/lib/types";

export function AllocationChart({
  holdings,
  displayCurrency,
}: {
  holdings: HoldingWithQuote[];
  displayCurrency: DisplayCurrency;
}) {
  const [mode, setMode] = useState("stock");
  const [active, setActive] = useState<string | null>(null);
  const total = holdings.reduce((sum, h) => sum + h.displayMarketValue, 0);
  const groups = new Map<string, number>();
  holdings
    .filter((h) => h.displayMarketValue > 0)
    .forEach((h) => {
      const label =
        mode === "market"
          ? h.currency === "KRW"
            ? "국내 주식"
            : "해외 주식"
          : h.symbol.replace(".KS", "").replace(".KQ", "");
      groups.set(label, (groups.get(label) ?? 0) + h.displayMarketValue);
    });
  const data = [...groups].map(([name, value]) => ({ name, value }));
  const circumference = 2 * Math.PI * 73;
  const selected = data.find((d) => d.name === active);
  let offset = 0;
  return (
    <section className="surface">
      <div className="surface-header">
        <div>
          <h2>자산 배분</h2>
          <p>내 포트폴리오를 이루는 조각들</p>
        </div>
        <select
          value={mode}
          onChange={(event) => {
            setMode(event.target.value);
            setActive(null);
          }}
          aria-label="자산 배분 기준"
        >
          <option value="stock">종목별</option>
          <option value="market">시장별</option>
        </select>
      </div>
      {total > 0 ? (
        <>
          <div className="allocation-graphic">
            <svg
              viewBox="0 0 200 200"
              width="100%"
              height="100%"
              role="img"
              aria-label={data
                .map(
                  (d) => `${d.name} ${((d.value / total) * 100).toFixed(1)}%`,
                )
                .join(", ")}
            >
              <circle
                cx="100"
                cy="100"
                r="73"
                fill="none"
                stroke="#f3f5ef"
                strokeWidth="22"
              />
              {data.map((d, i) => {
                const length = (d.value / total) * circumference;
                const currentOffset = offset;
                offset += length;
                return (
                  <circle
                    key={d.name}
                    cx="100"
                    cy="100"
                    r="73"
                    fill="none"
                    stroke={ASSET_COLORS[i % ASSET_COLORS.length]}
                    strokeWidth={active === d.name ? 26 : 22}
                    strokeDasharray={`${Math.max(0, length - 4)} ${circumference - Math.max(0, length - 4)}`}
                    strokeDashoffset={-currentOffset}
                    transform="rotate(-90 100 100)"
                    onMouseEnter={() => setActive(d.name)}
                    onMouseLeave={() => setActive(null)}
                    style={{
                      opacity: !active || active === d.name ? 1 : 0.45,
                      transition: "opacity .15s, stroke-width .15s",
                    }}
                  />
                );
              })}
            </svg>
            <div className="allocation-center">
              <small>{selected ? selected.name : "보유 종목"}</small>
              <strong>
                {selected
                  ? `${((selected.value / total) * 100).toFixed(1)}%`
                  : `${holdings.length}개`}
              </strong>
              <span>
                {selected
                  ? formatCurrency(selected.value, displayCurrency)
                  : "나만의 포트폴리오"}
              </span>
            </div>
          </div>
          <div className="allocation-legend">
            {data.map((d, i) => (
              <div key={d.name}>
                <i
                  style={{ background: ASSET_COLORS[i % ASSET_COLORS.length] }}
                />
                <button
                  onClick={() => setActive(active === d.name ? null : d.name)}
                  aria-pressed={active === d.name}
                >
                  {d.name}
                </button>
                <strong>{((d.value / total) * 100).toFixed(1)}%</strong>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="empty-chart">
          <CircleDot size={30} />
          <p>자산을 기록하면 종목별 비중을 보여드려요.</p>
        </div>
      )}
    </section>
  );
}
