"use client";
import { useId, useState, useSyncExternalStore } from "react";
import { moverKinds, type MoverKind } from "@/features/market/movers-model";
import { HomeSection } from "./HomeSection";
import { MoverTable } from "./MoverTable";
import homeStyles from "./home.module.css";
import styles from "./market-movers.module.css";
const mobileQuery = "(max-width: 760px)";
function subscribeWidth(listener: () => void) {
  const media = window.matchMedia(mobileQuery);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}
const mobileSnapshot = () => window.matchMedia(mobileQuery).matches;
const serverSnapshot = () => false;
const compactSnapshot = () => true;
const noWidthSubscription = () => () => {};

export function MarketMovers({ compact = false }: { compact?: boolean }) {
  const [selected, setSelected] = useState<MoverKind>("active");
  const listId = useId();
  const singleCategory = useSyncExternalStore(
    compact ? noWidthSubscription : subscribeWidth,
    compact ? compactSnapshot : mobileSnapshot,
    compact ? compactSnapshot : serverSnapshot,
  );
  const tabs = <div className={compact ? styles.tabs : homeStyles.mobileRankTabs} role="group" aria-label="순위 목록 선택">
    {moverKinds.map((kind) => (
      <button
        key={kind}
        type="button"
        aria-pressed={selected === kind}
        aria-controls={listId}
        onClick={() => setSelected(kind)}
      >
        {kind === "gainers" ? "상승" : kind === "losers" ? "하락" : "거래량"}
      </button>
    ))}
  </div>;
  return (
    <HomeSection title="종목 순위" label="미국 시장 종목 순위" className={compact ? undefined : homeStyles.rankingSection} grouped actions={compact ? tabs : undefined}>
      {!compact && tabs}
      <div id={listId} className={compact ? undefined : homeStyles.rankingGrid}>
        {moverKinds.filter(kind => !singleCategory || selected === kind).map(kind => <MoverTable key={kind} kind={kind} />)}
      </div>
    </HomeSection>
  );
}
