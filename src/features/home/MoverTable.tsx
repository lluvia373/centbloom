"use client";
import Link from "next/link";
import { ChevronRight, Flame } from "lucide-react";
import { AssetAvatar } from "@/components/AssetAvatar";
import {
  formatCurrency,
  formatPercent,
  formatCompactNumber,
} from "@/lib/format";
import { useMarketMovers } from "@/features/market/use-market-movers";
import { describeRankChange, type RankChange } from "@/features/market/mover-ranks";
import type { MoverKind } from "@/features/market/movers-model";
import { rankingPages } from "@/features/market/ranking-pages";
import styles from "./home.module.css";
function RankMovement({ change }: { change: RankChange | undefined }) {
  const delta = typeof change === "number" ? change : 0;
  const color = delta > 0 ? styles.up : delta < 0 ? styles.down : "";
  const label = describeRankChange(change);
  return (
    <span className={[styles.rankChange, color].filter(Boolean).join(" ")} title={label} aria-label={label}>
      {change === "new" ? "신규" : delta ? (delta > 0 ? "▲" : "▼") + Math.abs(delta) : "—"}
    </span>
  );
}

export function MoverTable({ kind, full = false }: { kind: MoverKind; full?: boolean }) {
  const { data, failed, refresh } = useMarketMovers(kind);
  const page = rankingPages[kind];
  const heading = (
    <>
      <span aria-hidden="true" className={kind === "gainers" ? styles.up : kind === "losers" ? styles.down : styles.note}>
        {kind === "gainers" ? "↗" : kind === "losers" ? "↘" : <Flame size={16} className={styles.volumeIcon} aria-hidden="true" />}
      </span>{" "}
      {page.title}
    </>
  );
  return (
    <section className={styles.moverPanel} aria-label={page.title}>
      {!full && <div className={styles.moverHeading}>
        <h3>
          <Link href={page.href} className={styles.headingLink}>
            {heading}
            <ChevronRight size={16} className={styles.headingChevron} aria-hidden="true" />
          </Link>
        </h3>
      </div>}
      <div className={styles.tableLegend}>
        <span title="순위 변동은 직전 정상 조회 목록과 비교합니다">순위 · 종목</span>
        <span>{kind === "active" ? "현재가 · 거래량" : "현재가 · 등락률"}</span>
      </div>
      {!data && (
        <p className={styles.empty} role="status">
          {failed ? "종목을 가져오지 못했어요." : "시세를 확인하고 있어요."}
        </p>
      )}
      <ol className={styles.movers}>
        {data?.quotes.slice(0, full ? 10 : 5).map((q, i) => (
          <li key={q.symbol}>
            <Link
              href={"/stock/" + encodeURIComponent(q.symbol)}
              title={q.name + " · 미국 정규장 기준 · 지연 가능"}
            >
              <span className={styles.rankPosition}>
                <span className={styles.rank} aria-label={String(i + 1) + "위"}>{i + 1}</span>
                <RankMovement change={data.rankChanges[q.symbol]} />
              </span>
              <AssetAvatar symbol={q.symbol} logoUrl={q.logoUrl} small />
              <span className={styles.stockName}>
                <strong>{q.symbol}</strong>
                <small>{q.name}</small>
              </span>
              <span className={styles.stockValue}>
                <strong>{formatCurrency(q.price, q.currency)}</strong>
                <small
                  className={
                    kind === "active"
                      ? styles.volume
                      : q.changePercent > 0
                        ? styles.up
                        : styles.down
                  }
                >
                  {kind === "active"
                    ? formatCompactNumber(q.volume ?? 0) + "주"
                    : formatPercent(q.changePercent)}
                </small>
              </span>
            </Link>
          </li>
        ))}
      </ol>
      {data && data.quotes.length < 5 && (
        <p className={styles.note}>
          현재 제공된 유효 종목 {data.quotes.length}개
        </p>
      )}
      {failed && (
        <p role="status" className={styles.note}>
          {data ? "갱신 실패 · 이전 목록 표시 중. " : ""}
          <button onClick={refresh}>다시 시도</button>
        </p>
      )}

    </section>
  );
}
