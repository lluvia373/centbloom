"use client";
import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { AssetAvatar } from "@/components/AssetAvatar";
import { formatWatchPrice, useWatchlist } from "@/hooks/useWatchlist";
import { formatPercent } from "@/lib/format";
import { marketSessionDate } from "@/features/market/market-changes";
import { useWatchedReports } from "@/features/market/use-watched-reports";
import styles from "./WatchlistPreview.module.css";

export function WatchlistPreview() {
  const { items, quotes, ready, quotesLoading, error, failedSymbols, refresh, refreshing } = useWatchlist({ quoteLimit: 3 });
  const rows = items.slice(0, 3);
  const reports = useWatchedReports(rows.map(item => item.symbol));
  return <section className={styles.preview}>
    <div className={styles.heading}>
      <h2>관심종목</h2>
      <Link href="/watchlist" aria-label="관심종목 모두 보기"><ChevronRight size={18} aria-hidden="true" /></Link>
    </div>
    {!ready ? <p className={styles.note}>관심종목을 불러오고 있어요.</p> : rows.length ? (
      <ul className={styles.list}>
        {rows.map(item => {
          const report = reports[item.symbol];
          const quote = quotes[item.symbol] ?? report?.quote;
          const sessionDate = marketSessionDate(quote?.quotedAt);
          const previous = sessionDate && sessionDate === marketSessionDate(report?.quote.quotedAt) ? report?.previous : null;
          const story = report?.story;
          return <li key={item.symbol}>
            <Link href={"/stock/" + encodeURIComponent(item.symbol)} className={styles.stock}>
              <AssetAvatar symbol={item.symbol} logoUrl={quote?.logoUrl} />
              <span className={styles.company}><strong>{item.name}</strong><small>{item.symbol}</small></span>
              <span className={styles.price}>
                {quote ? <><strong>{formatWatchPrice(quote.price, quote.currency)}</strong>
                  <small className={quote.changePercent > 0 ? styles.up : quote.changePercent < 0 ? styles.down : undefined}>{formatPercent(quote.changePercent)}</small></>
                  : <small>{quotesLoading ? "조회 중…" : "시세 확인 불가"}</small>}
              </span>
            </Link>
            {previous && report && <p className={styles.previous}>
              <span>이전 거래일 기록 <time dateTime={previous.sessionDate}>{previous.sessionDate.slice(5).replace("-", ".")}</time> {formatPercent(previous.changePercent)}</span>
              <span aria-hidden="true">→</span>
              <span>이번 장 <strong>{formatPercent(report.quote.changePercent)}</strong></span>
            </p>}
            {story && <div className={styles.story}>
              <a href={story.url} target="_blank" rel="noopener noreferrer">{story.titleKo || story.title}</a>
              <small>{story.publisher} · {new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(story.publishedAt))} KST{story.titleKo ? " · 자동 번역" : ""}</small>
            </div>}
          </li>;
        })}
      </ul>
    ) : error ? null : <p className={styles.note}>관심종목 없음</p>}
    {error && <p role="alert" className={styles.error}>{error} <button onClick={() => { void refresh(); }} disabled={refreshing}>다시 시도</button></p>}
    {failedSymbols.length > 0 && <p role="status" className={styles.error}>일부 시세를 불러오지 못했어요.</p>}
    {rows.length > 0 && <p className={styles.meta}>시세 지연 가능</p>}
    <Link href="/watchlist" className={styles.add}><Plus size={14} aria-hidden="true" /> 관심종목 추가</Link>
  </section>;
}
