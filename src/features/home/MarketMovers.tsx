"use client";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { moverKinds, type MoverKind } from "@/features/market/movers-model";
import { DiscoveryShortcuts } from "./DiscoveryShortcuts";
import { MoverTable } from "./MoverTable";
import styles from "./home.module.css";
const mobileQuery = "(max-width: 760px)";
function subscribeWidth(listener: () => void) {
  const media = window.matchMedia(mobileQuery);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}
const mobileSnapshot = () => window.matchMedia(mobileQuery).matches;
const serverSnapshot = () => false;
export function MarketMovers({ children }: { children?: ReactNode }) {
  const [selected, setSelected] = useState<MoverKind>("active");
  const mobile = useSyncExternalStore(
    subscribeWidth,
    mobileSnapshot,
    serverSnapshot,
  );
  return (
    <section className={styles.rankingSection} aria-label="미국 시장 종목 순위">
      <div className={styles.sectionHead}>
        <h2>종목 순위</h2>
        {children}
      </div>
      {children && <DiscoveryShortcuts />}
      <div className={styles.mobileRankTabs} aria-label="순위 목록 선택">
        {moverKinds.map((kind) => (
          <button
            key={kind}
            aria-pressed={selected === kind}
            onClick={() => setSelected(kind)}
          >
            {kind === "gainers"
              ? "상승"
              : kind === "losers"
                ? "하락"
                : "거래량"}
          </button>
        ))}
      </div>
      <div className={styles.rankingGrid}>
        {moverKinds
          .filter((kind) => !mobile || selected === kind)
          .map((kind) => (
            <MoverTable key={kind} kind={kind} />
          ))}
      </div>
    </section>
  );
}
