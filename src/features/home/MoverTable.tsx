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
import { WatchStockButton } from "@/features/watchlist/WatchStockButton";
import styles from "./home.module.css";
function RankMovement({ change }: { change: RankChange | undefined }) {
  const delta = typeof change === "number" ? change : 0;
  const label = describeRankChange(change);
  return (
    <span className={styles.rankChange} title={label} aria-label={label}>
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
    <section className={[styles.moverPanel, full ? styles.fullRanking : ""].join(" ")} aria-label={page.title}>
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
        <span>{full ? "현재가" : "현재가 · 등락률"}</span>
        {full && <>
          <span className={styles.fullChange}>등락률</span>
          <span className={styles.fullVolume}>거래량</span>
          <span className={styles.watchHeading}>관심</span>
        </>}
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
              className={styles.moverLink}
              href={"/stock/" + encodeURIComponent(q.symbol)}
              title={q.name + " · 미국 정규장 기준 · 지연 가능"}
            >
              <span className={styles.rankPosition}>
                <span className={styles.rank} aria-label={String(i + 1) + "위"}>{i + 1}</span>
                <RankMovement change={data.rankChanges[q.symbol]} />
              </span>
              <AssetAvatar symbol={q.symbol} logoUrl={q.logoUrl} small />
              <span className={styles.stockName}>
                <strong>{q.name}</strong>
                <small>{q.symbol}{(kind === "active" || full) && <span className={styles.inlineVolume}> · {q.volume == null ? "거래량 —" : formatCompactNumber(q.volume) + "주"}</span>}</small>
              </span>
              <span className={styles.stockValue}>
                <strong>{formatCurrency(q.price, q.currency)}</strong>
                <small
                  className={[styles.inlineChange, q.changePercent > 0 ? styles.up : q.changePercent < 0 ? styles.down : styles.volume].join(" ")}
                >
                  {formatPercent(q.changePercent)}
                </small>
              </span>
              {full && <>
                <span className={[styles.fullChange, q.changePercent > 0 ? styles.up : q.changePercent < 0 ? styles.down : styles.volume].join(" ")}>{formatPercent(q.changePercent)}</span>
                <span className={styles.fullVolume}>{q.volume == null ? "—" : formatCompactNumber(q.volume) + "주"}</span>
              </>}
            </Link>
            {full && <WatchStockButton symbol={q.symbol} name={q.name} compact className={styles.rankingWatch} />}
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
