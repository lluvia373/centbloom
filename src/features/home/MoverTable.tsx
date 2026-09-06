"use client";
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
  const { data, loading, failed, refresh } = useMarketMovers(kind);
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
        <span>TOP 10</span>
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
      <ol className={styles.movers}>
        {data?.quotes.map((q, i) => (
          <li key={q.symbol}>
            <Link
              href={"/stock/" + encodeURIComponent(q.symbol)}
              title={q.name + " · " + q.quotedAt + " · 정규장 기준"}
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
      {data && data.quotes.length < 10 && (
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
      {data && (
        <p className={styles.note}>
          {new Intl.DateTimeFormat("ko-KR", {
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Asia/Seoul",
          }).format(new Date(data.fetchedAt))}{" "}
          조회{loading ? " · 갱신 중" : ""}
        </p>
      )}
    </section>
  );
}
