"use client";
import { useId, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AssetAvatar } from "@/components/AssetAvatar";
import { formatCurrency, formatPercent } from "@/lib/format";
import { useMarketChanges } from "@/features/market/use-market-changes";
import { changeKinds, changeLabels, changeObservation, type ChangeKind } from "@/features/market/market-changes";
import type { ResearchedChangesFeed } from "@/features/market/change-research";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useWatchedReports } from "@/features/market/use-watched-reports";
import { mergeWatchedChanges, selectPersonalizedChanges } from "@/features/market/personalized-changes";
import { WatchStockButton } from "@/features/watchlist/WatchStockButton";
import { HomeSection } from "./HomeSection";
import styles from "./home.module.css";
import changeStyles from "./market-changes.module.css";

export function MarketChanges({ initialData, pageSize = 3 }: { initialData?: ResearchedChangesFeed | null; pageSize?: 2 | 3 }) {
  const { data, failed, retry } = useMarketChanges(initialData);
  const { items: watched } = useWatchlist({ loadQuotes: false });
  const symbols = watched.map(item => item.symbol);
  const reports = useWatchedReports(symbols);
  const items = mergeWatchedChanges(data?.items ?? [], symbols, reports);
  const [selected, setSelected] = useState<ChangeKind | undefined>();
  const [pageIndex, setPageIndex] = useState(0);
  const listId = useId();
  const activeKind = items.some(item => item.signals.some(signal => signal.kind === selected)) ? selected : undefined;
  const candidates = selectPersonalizedChanges(items, symbols, activeKind, 9);
  const pageCount = Math.ceil(candidates.length / pageSize);
  const currentPage = activeKind === selected ? Math.min(pageIndex, Math.max(0, pageCount - 1)) : 0;
  const shown = candidates.slice(currentPage * pageSize, currentPage * pageSize + pageSize);
  const availableKinds = changeKinds.filter(kind => items.some(item => item.signals.some(signal => signal.kind === kind)));
  const changePage = (index: number) => { setSelected(activeKind); setPageIndex(index); };
  const dates = [...new Set(shown.map(item => item.sessionDate))].sort();
  if (data && !items.length) return null;
  return (
    <HomeSection title="평소와 다른 움직임" className={changeStyles.changesSection} grouped actions={pageCount > 1 && (
      <nav className={changeStyles.changePagination} aria-label="움직임 카드 페이지">
        <button aria-label="이전 종목" aria-controls={listId} disabled={currentPage === 0}
          onClick={() => changePage(currentPage - 1)}><ChevronLeft size={16} aria-hidden="true" /></button>
        <span role="status" aria-live="polite" aria-atomic="true"><span className="sr-only">페이지 </span>{currentPage + 1} / {pageCount}</span>
        <button aria-label="다음 종목" aria-controls={listId} disabled={currentPage === pageCount - 1}
          onClick={() => changePage(currentPage + 1)}><ChevronRight size={16} aria-hidden="true" /></button>
      </nav>
    )}>
      <div className={changeStyles.changeToolbar}>
        <div className={changeStyles.changeFilters} aria-label="움직임 종류">
          <button aria-pressed={!activeKind} onClick={() => { setSelected(undefined); setPageIndex(0); }}>전체</button>
          {availableKinds.map(kind => <button key={kind} aria-pressed={activeKind === kind}
            onClick={() => { setSelected(kind); setPageIndex(0); }}>{changeLabels[kind]}</button>)}
        </div>
        {dates.length > 0 && <span className={styles.sectionMeta}>{dates.map(date => date.slice(5).replace("-", ".")).join(" · ")} 미국 정규장 · 지연 가능</span>}
      </div>
      {failed && !data && !items.length && <p className={styles.note} role="status">움직임을 불러오지 못했어요. <button onClick={retry}>다시 시도</button></p>}
      {!data && !items.length && !failed ? <div className={changeStyles.changesLoading} role="status">시장 움직임을 불러오고 있어요.</div> :
        <div id={listId} className={changeStyles.changeGrid}>
          {shown.map(item => {
            const q = item.quote;
            const primary = item.signals[0];
            const observation = changeObservation(item);
            const metric = primary.kind === "volume" ? primary.ratio.toFixed(1) : primary.kind === "reversal" ? String(primary.baseline) : formatPercent(q.changePercent);
            const story = item.story;
            const href = "/stock/" + encodeURIComponent(q.symbol);
            return <article className={changeStyles.changeCard} key={q.symbol}>
              <div className={changeStyles.changeCardTop}>
                <Link href={href} className={changeStyles.changeCompany}>
                  <AssetAvatar symbol={q.symbol} logoUrl={q.logoUrl} small />
                  <span><strong>{q.name}</strong><small>{q.symbol} · {formatCurrency(q.price, q.currency)}</small></span>
                </Link>
                <div className={changeStyles.changeMetric}>
                  <span>{primary.kind === "volume" ? "평소 대비 거래량" : primary.kind === "price" ? "이번 장 등락률" : `연속 ${q.changePercent > 0 ? "하락" : "상승"} 후 전환`}</span>
                  <div className={changeStyles.changeMetricValue}>
                    <strong className={primary.kind === "price" ? (q.changePercent > 0 ? styles.up : q.changePercent < 0 ? styles.down : styles.volume) : undefined}>{metric}{primary.kind !== "price" && <small>{primary.kind === "volume" ? "배" : "일"}</small>}</strong>
                    {primary.kind !== "price" && <span className={changeStyles.changeQuoteMove}>주가 <span className={q.changePercent > 0 ? styles.up : q.changePercent < 0 ? styles.down : styles.volume}>{formatPercent(q.changePercent)}</span></span>}
                  </div>
                </div>
                <WatchStockButton symbol={q.symbol} name={q.name} compact className={styles.rankingWatch} />
              </div>
              <div className={changeStyles.changeObservation}>
                <h3>{observation.headline}</h3>
                <Link href={href + "#market-movement"} className={changeStyles.changeDetail} aria-label={q.name + " 변화 근거 보기"}>
                  변화 근거<ChevronRight size={14} aria-hidden="true" />
                </Link>
              </div>
              <div className={changeStyles.changeStory}>
                <a href={story.url} target="_blank" rel="noopener noreferrer">{story.titleKo || story.title}</a>
                <small>{story.publisher} · {new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(story.publishedAt))} KST{story.titleKo ? " · 자동 번역" : ""}</small>
              </div>
            </article>;
          })}
        </div>}
    </HomeSection>
  );
}
