"use client";
import { useId, useState } from "react";
import Link from "next/link";
import { AssetAvatar } from "@/components/AssetAvatar";
import {
  formatCurrency,
  formatPercent,
  formatCompactNumber,
} from "@/lib/format";
import { useMarketMovers } from "@/features/market/use-market-movers";
import type { MoverKind } from "@/features/market/movers-model";
import styles from "./home.module.css";
const titles = {
  gainers: "상승 종목",
  losers: "하락 종목",
  active: "거래량 상위",
};
export function MoverTable({ kind }: { kind: MoverKind }) {
  const { data, failed, refresh } = useMarketMovers(kind);
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  return (
    <section className={styles.moverPanel} aria-label={titles[kind]}>
      <div className={styles.moverHeading}>
        <h3>
          <span
            className={
              kind === "gainers"
                ? styles.up
                : kind === "losers"
                  ? styles.down
                  : styles.note
            }
          >
            {kind === "gainers" ? "↗" : kind === "losers" ? "↘" : "≋"}
          </span>{" "}
          {titles[kind]}
        </h3>
      </div>
      <div className={styles.tableLegend}>
        <span>종목</span>
        <span>{kind === "active" ? "현재가 · 거래량" : "현재가 · 등락률"}</span>
      </div>
      {!data && (
        <p className={styles.empty} role="status">
          {failed ? "종목을 가져오지 못했어요." : "시세를 확인하고 있어요."}
        </p>
      )}
      <ol id={listId} className={styles.movers}>
        {data?.quotes.slice(0, expanded ? 10 : 5).map((q, i) => (
          <li key={q.symbol}>
            <Link
              href={"/stock/" + encodeURIComponent(q.symbol)}
              title={q.name + " · " + q.quotedAt + " · 미국 정규장 기준 · 지연 가능"}
            >
              <span className={styles.rank}>{i + 1}</span>
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
      {data && data.quotes.length > 5 && (
        <button className={styles.moreMovers} aria-expanded={expanded} aria-controls={listId} onClick={() => setExpanded(!expanded)}>
          {expanded ? "접기" : "더 보기"}
        </button>
      )}
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
