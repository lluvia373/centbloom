import { formatAllocationWeight, type buildHoldingAllocation } from "../model/holding-allocation";
import styles from "./PortfolioHoldings.module.css";

// Repeated, restrained colors are a visual aid, never a unique security identifier.
const COLORS = ["chart", "comparison-8", "comparison-11", "comparison-4", "muted", "focus"];
export function holdingAllocationColor(key: string) {
  let hash = 0;
  for (let index = 0; index < key.length; index++) hash = (Math.imul(hash, 31) + key.charCodeAt(index)) >>> 0;
  return `var(--cf-color-${COLORS[hash % COLORS.length]})`;
}

export function HoldingsComposition({ allocation, activeId, id, loading }: {
  allocation: ReturnType<typeof buildHoldingAllocation>;
  activeId: string | null;
  id: string;
  loading?: boolean;
}) {
  let offset = 0;
  const segments = allocation.segments.map(segment => {
    const result = { ...segment, start: offset };
    offset += segment.weight;
    return result;
  });
  const active = segments.find(segment => segment.key === activeId);
  const featured = active ?? segments[0];
  return <figure className={styles.composition} data-unavailable={!allocation.available || undefined}>
    {allocation.available && <div className={styles.compositionRing}>
      <svg viewBox="0 0 200 200" role="img" aria-describedby={id}
        aria-label="전체 보유 비중. 종목별 금액과 비중은 보유종목 표에서 확인할 수 있습니다.">
        <g transform="rotate(-90 100 100)" fill="none" strokeLinecap="butt" aria-hidden="true">
          {segments.map(segment => <circle key={segment.key} data-holding-id={segment.key}
            data-weight={segment.weight} data-start={segment.start}
            cx="100" cy="100" r="84" pathLength="100" strokeWidth="28"
            strokeDasharray={`${segment.weight} ${100 - segment.weight}`} strokeDashoffset={-segment.start}
            stroke={holdingAllocationColor(segment.key)} opacity={active && active.key !== segment.key ? 0.25 : 1} />)}
          {active && active.weight > 0 && <>
            <circle data-allocation-outline={active.key} cx="100" cy="100" r="84" pathLength="100"
              strokeDasharray={`${active.weight} ${100 - active.weight}`} strokeDashoffset={-active.start}
              stroke="var(--cf-color-ink)" strokeWidth="32" />
            <circle cx="100" cy="100" r="84" pathLength="100"
              strokeDasharray={`${active.weight} ${100 - active.weight}`} strokeDashoffset={-active.start}
              stroke={holdingAllocationColor(active.key)} strokeWidth="28" />
          </>}
        </g>
      </svg>
      <div className={styles.compositionCenter} aria-hidden="true">
        <span>{active ? "보유 비중" : "최대 비중"}</span>
        <strong>{formatAllocationWeight(featured.weight)}</strong>
      </div>
    </div>}
    <figcaption className={styles.compositionCaption}>
      {allocation.available && <>
        <strong>{featured.name || featured.symbol}</strong>
        <span>{featured.symbol}</span>
        <span className={styles.compositionAccessibleWeight}>{active ? "보유 비중" : "최대 비중"} {formatAllocationWeight(featured.weight)}</span>
      </>}
      <span id={id} className={styles.compositionBasis}>전체 보유자산 기준</span>
    </figcaption>
    {!allocation.available && <p className={styles.compositionStatus} role="status">
      {loading ? "시세·환율 확인 중" : allocation.complete
        ? "평가액이 없어 비중을 표시할 수 없습니다."
        : "시세·환율이 누락되어 전체 비중을 표시할 수 없습니다."}
    </p>}
  </figure>;
}
