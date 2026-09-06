"use client";
import { useState, useSyncExternalStore } from "react";
import { moverKinds, type MoverKind } from "@/features/market/movers-model";
import Link from "next/link";
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
export function MarketMovers() {
  const [selected, setSelected] = useState<MoverKind>("gainers");
  const mobile = useSyncExternalStore(
    subscribeWidth,
    mobileSnapshot,
    serverSnapshot,
  );
  return (
    <section className={styles.rankingSection} aria-label="미국 시장 종목 순위">
      <div className={styles.sectionHead}>
        <div>
          <span className={styles.eyebrow}>미국 주식</span>
          <h2>지금 움직이는 종목</h2>
        </div>
        <Link href="/discover" className={styles.textLink}>
          한국 · 해외 종목 탐색 ↗
        </Link>
      </div>
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
      <details className={styles.coverage}>
        <summary>순위 기준 · 정규장 시세 · 지연 가능</summary>
        <p>
          Yahoo Finance의 미국 주식 필터 목록입니다. 시가총액·거래량 등 공급원
          조건을 통과한 종목에서 최대 10개를 표시하며, 모든 상장 종목의 절대
          순위는 아닙니다. 상승·하락은 5달러 이상 등의 조건이 적용됩니다. 휴장
          중에는 최근 거래일 정규장 시세를 보여주며 1분마다 목록을 확인합니다.
          종목 위에 마우스를 올리면 가격 기준 시각을 볼 수 있습니다.
        </p>
      </details>
    </section>
  );
}
