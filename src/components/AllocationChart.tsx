"use client";

import { ALLOCATION_PAGE_SIZE, buildHoldingAllocation, formatAllocationWeight, getAllocationPage } from "@/features/portfolio/model/holding-allocation";
import styles from "@/features/portfolio/ui/PortfolioHoldings.module.css";
import { formatCurrency } from "@/lib/format";
import type { DisplayCurrency, HoldingWithQuote } from "@/lib/types";
import { Search } from "lucide-react";
import { useId, useState, type CSSProperties } from "react";

const COLOR_COUNT = 16;

function slicePath(start: number, weight: number) {
  const point = (percent: number) => {
    const angle = percent / 100 * Math.PI * 2 - Math.PI / 2;
    // Keep server and browser SVG attributes identical despite trig rounding differences.
    return `${(100 + 96 * Math.cos(angle)).toFixed(6)},${(100 + 96 * Math.sin(angle)).toFixed(6)}`;
  };
  return `M 100,100 L ${point(start)} A 96,96 0 ${weight > 50 ? 1 : 0},1 ${point(start + weight)} Z`;
}

export function AllocationChart({ holdings, displayCurrency, loading }: {
  holdings: HoldingWithQuote[];
  displayCurrency: DisplayCurrency;
  loading?: boolean;
}) {
  const patternId = useId().replaceAll(":", "");
  const [active, setActive] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const allocation = buildHoldingAllocation(holdings);
  if (holdings.length === 0) return null;

  // Bind colors to identities, not the live valuation order.
  const colorIndexes = new Map([...allocation.segments]
    .sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0)
    .map((segment, index) => [segment.key, index]));
  const color = (index: number) => `var(--cf-color-allocation-${index % COLOR_COUNT + 1})`;
  const fill = (key: string) => {
    const index = colorIndexes.get(key)!;
    return index < COLOR_COUNT ? color(index) : `url(#${patternId}-${index})`;
  };
  let offset = 0;
  const slices = allocation.segments.map((segment) => {
    const start = offset;
    offset += segment.weight;
    return { ...segment, path: slicePath(start, segment.weight) };
  });
  const positiveCount = slices.filter((segment) => segment.value > 0).length;
  const selected = slices.find((segment) => segment.key === (hovered ?? active));
  const featured = selected ?? slices[0];
  const listed = getAllocationPage(allocation.segments, query, page);
  const listId = `${patternId}-list`;
  const listStyle = { "--allocation-rows": Math.max(1, Math.ceil(listed.items.length / 2)) } as CSSProperties;
  const changePage = (next: number) => {
    setPage(next);
    setActive(null);
    setHovered(null);
  };

  return (
    <section className={styles.concentration} aria-label="보유종목 구성">
      <div className={styles.concentrationHeading}>
        <h2>자산 구성 <span>{holdings.length}종목</span></h2>
        {allocation.available && (holdings.length > ALLOCATION_PAGE_SIZE || query) && (
          <label className={`${styles.search} ${styles.allocationSearch}`}>
            <Search size={14} aria-hidden="true" />
            <input aria-label="자산 구성 종목 검색" placeholder="종목 검색" value={query}
              onChange={(event) => { setQuery(event.target.value); changePage(0); }} />
          </label>
        )}
      </div>
      {allocation.available ? (
        <div className={styles.allocationContent}>
          <div className={styles.allocationFigure}>
            <div className={styles.allocationRing}>
              <svg className={styles.allocationPie} viewBox="0 0 200 200" role="img"
                aria-label={`전체 ${holdings.length}종목 비중`}
                onPointerLeave={() => setHovered(null)}>
                <defs>
                  <clipPath id={`${patternId}-ring`}>
                    <path clipRule="evenodd" d="M 100,4 a 96,96 0 1,0 0,192 a 96,96 0 1,0 0,-192 M 100,36 a 64,64 0 1,0 0,128 a 64,64 0 1,0 0,-128" />
                  </clipPath>
                  {[...colorIndexes].filter(([, index]) => index >= COLOR_COUNT).map(([key, index]) => (
                    <pattern key={key} id={`${patternId}-${index}`} width="8" height="8"
                      patternUnits="userSpaceOnUse" patternTransform={`rotate(${Math.floor(index / COLOR_COUNT) * 45})`}>
                      <rect width="8" height="8" fill={color(index)} />
                      <path d="M 0,0 L 0,8" stroke="var(--cf-color-surface)" strokeWidth="2" />
                    </pattern>
                  ))}
                </defs>
                <g clipPath={`url(#${patternId}-ring)`}>
                  {slices.filter((segment) => segment.value > 0).map((segment) => {
                    const sliceProps = {
                      fill: fill(segment.key),
                      className: styles.allocationSlice,
                      opacity: selected && selected.key !== segment.key ? 0.25 : 1,
                      "data-selected": selected?.key === segment.key || undefined,
                      onPointerEnter: () => setHovered(segment.key),
                    };
                    return positiveCount === 1 ? (
                      <circle key={segment.key} cx="100" cy="100" r="96" {...sliceProps} />
                    ) : (
                      <path key={segment.key} d={segment.path} {...sliceProps} />
                    );
                  })}
                </g>
              </svg>
              <div className={styles.allocationCenter} aria-hidden="true">
                <span>{selected ? "보유 비중" : "최대 비중"}</span>
                <strong>
                  {formatAllocationWeight(featured.weight)}
                </strong>
              </div>
            </div>
            <div className={styles.allocationCaption}>
              <strong>{featured.name}</strong>
              <span>{formatCurrency(featured.value, displayCurrency)}</span>
            </div>
          </div>
          <div className={styles.allocationDirectory}>
          {listed.total > 0 ? <ul id={listId} className={styles.allocationList} style={listStyle}>
            {listed.items.map((segment, index) => (
              <li key={segment.key} aria-posinset={listed.start + index + 1} aria-setsize={listed.total}>
                <button type="button" className={styles.allocationItem}
                  aria-label={`${segment.name} ${segment.symbol}, ${formatAllocationWeight(segment.weight)}, ${formatCurrency(segment.value, displayCurrency)}`}
                  aria-pressed={active === segment.key}
                  data-highlighted={featured.key === segment.key || undefined}
                  onClick={() => setActive(active === segment.key ? null : segment.key)}
                  onPointerEnter={() => setHovered(segment.key)} onPointerLeave={() => setHovered(null)}
                  onFocus={() => setHovered(segment.key)} onBlur={() => setHovered(null)}>
                  <svg className={styles.allocationSwatch} viewBox="0 0 16 16" aria-hidden="true">
                    <rect width="16" height="16" rx="3" fill={fill(segment.key)} />
                  </svg>
                  <span className={styles.allocationName}>
                    <span title={segment.name}>{segment.name}</span>
                    <small>{segment.symbol}</small>
                  </span>
                  <span className={styles.allocationValue}>
                    <strong>{formatAllocationWeight(segment.weight)}</strong>
                  </span>
                </button>
              </li>
            ))}
          </ul> : <p id={listId} className={styles.allocationEmpty} role="status">검색 결과가 없습니다.</p>}
          {holdings.length > ALLOCATION_PAGE_SIZE && (
            <div className={styles.allocationPagination}>
              <span role="status">{listed.total > 0 ? `${listed.start + 1}–${listed.start + listed.items.length}` : "0"} / {listed.total}종목</span>
              {listed.pageCount > 1 && <div className={styles.allocationPageActions}>
                <button type="button" aria-label="자산 구성 이전 페이지" aria-controls={listId}
                  disabled={listed.page === 0} onClick={() => changePage(listed.page - 1)}>이전</button>
                <span>{listed.page + 1} / {listed.pageCount}</span>
                <button type="button" aria-label="자산 구성 다음 페이지" aria-controls={listId}
                  disabled={listed.page === listed.pageCount - 1} onClick={() => changePage(listed.page + 1)}>다음</button>
              </div>}
            </div>
          )}
          </div>
        </div>
      ) : (
        <p className={styles.allocationStatus} role="status">
          {loading ? "시세·환율 확인 중" : allocation.complete ? "평가액이 없어 비중을 표시할 수 없습니다." : "일부 시세·환율을 확인하지 못해 전체 비중을 표시할 수 없습니다."}
        </p>
      )}
    </section>
  );
}
