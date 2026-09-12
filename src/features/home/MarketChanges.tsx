"use client";
import { useId, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { AssetAvatar } from "@/components/AssetAvatar";
import { formatCompactNumber, formatCurrency, formatPercent } from "@/lib/format";
import { useMarketChanges } from "@/features/market/use-market-changes";
import { changeKinds, changeLabels, changeObservation, selectMarketChanges, type MarketChange, type ChangeKind, type ChangeSignal } from "@/features/market/market-changes";
import { useMarketNews } from "@/features/market/use-market-news";
import type { NewsFeed } from "@/features/market/trending-news";
import { WatchStockButton } from "@/features/watchlist/WatchStockButton";
import { HomeSection } from "./HomeSection";
import styles from "./home.module.css";

function Comparison({ signal }: { signal: ChangeSignal }) {
  if (signal.kind === "reversal") return (
    <div className={styles.changeReversal}>
      <span>{signal.baseline}거래일 연속 {signal.value > 0 ? "하락" : "상승"}</span>
      <span aria-hidden="true">→</span>
      <strong className={signal.value > 0 ? styles.up : styles.down}>{formatPercent(signal.value)}</strong>
    </div>
  );
  const current = Math.abs(signal.value);
  const maximum = Math.max(current, signal.baseline);
  const format = (value: number) => signal.kind === "volume" ? formatCompactNumber(value) + "주" : value.toFixed(2) + "%";
  return (
    <div className={styles.changeComparison}>
      <div>
        <span>{signal.kind === "volume" ? "이번 정규장" : "이번 등락폭"}</span>
        <strong>{format(current)}</strong>
        <span className={styles.changeBar} aria-hidden="true"><i style={{ width: `${current / maximum * 100}%` }} /></span>
      </div>
      <div>
        <span>{signal.kind === "volume" ? "3개월 하루 평균" : "20거래일 평균 등락폭"}</span>
        <strong>{format(signal.baseline)}</strong>
        <span className={styles.changeBar} aria-hidden="true"><i style={{ width: `${signal.baseline / maximum * 100}%` }} /></span>
      </div>
    </div>
  );
}

function RecentMovement({ item }: { item: MarketChange }) {
  if (!item.context?.recentMoves.length) return null;
  const moves = [...item.context.recentMoves, { date: item.sessionDate, percent: item.quote.changePercent }];
  const max = Math.max(...moves.map(move => Math.abs(move.percent)), 0.01);
  return <details className={styles.changeHistory}>
    <summary>최근 5거래일과 비교 <ChevronDown size={16} aria-hidden="true" /></summary>
    <ol aria-label={item.quote.name + " 최근 정규장 등락률"}>
      {moves.map((move, index) => <li key={move.date} className={index === moves.length - 1 ? styles.currentMove : undefined}>
        <span className={move.percent > 0 ? styles.up : move.percent < 0 ? styles.down : styles.volume}>{move.percent > 0 ? "+" : ""}{move.percent.toFixed(1)}%</span>
        <span className={styles.moveTrack} aria-hidden="true"><i className={move.percent < 0 ? styles.moveDown : styles.moveUp} style={{ height: `${Math.abs(move.percent) / max * 50}%` }} /></span>
        <time dateTime={move.date}>{move.date.slice(5).replace("-", ".")}</time>
        {index === moves.length - 1 && <small>이번 장</small>}
      </li>)}
    </ol>
  </details>;
}

export function MarketChanges({ initialNews }: { initialNews?: NewsFeed | null }) {
  const { data, failed, retry } = useMarketChanges();
  const { stories, error: newsFailed } = useMarketNews(undefined, initialNews);
  const [selected, setSelected] = useState<ChangeKind | undefined>();
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const candidates = selectMarketChanges(data?.items ?? [], selected, 9);
  const shown = candidates.slice(0, expanded ? 9 : 3);
  const dates = [...new Set(data?.items.map(item => item.sessionDate))].sort();
  return (
    <HomeSection title="평소와 다른 움직임" className={styles.changesSection} grouped>
      <div className={styles.changeToolbar}>
        <div className={styles.changeFilters} aria-label="움직임 종류">
          <button aria-pressed={!selected} onClick={() => { setSelected(undefined); setExpanded(false); }}>전체</button>
          {changeKinds.map(kind => <button key={kind} aria-pressed={selected === kind}
            onClick={() => { setSelected(kind); setExpanded(false); }}>{changeLabels[kind]}</button>)}
        </div>
        {dates.length > 0 && <span className={styles.sectionMeta}>{dates.map(date => date.slice(5).replace("-", ".")).join(" · ")} 미국 정규장 · 지연 가능</span>}
      </div>
      {failed && <p className={styles.note} role="status">{data ? "갱신 실패 · 이전 비교 표시 중" : "움직임을 비교하지 못했어요."} <button onClick={retry}>다시 시도</button></p>}
      {data?.partial && !failed && <p className={styles.note} role="status">일부 비교 자료를 가져오지 못해 확인된 변화만 표시합니다. <button onClick={retry}>다시 시도</button></p>}
      {!data && !failed ? <div className={styles.changesLoading} role="status">평소 거래량과 가격 흐름을 비교하고 있어요.</div> :
        data && !shown.length ? <p className={styles.changesLoading}>{data.examined === 0 ? "비교할 종목 자료가 없어요." : data.partial ? "현재 확인한 자료에서는 조건에 맞는 변화가 없어요." : "비교한 종목 중 조건에 맞는 변화가 없어요."}</p> :
        <div id={listId} className={styles.changeGrid}>
          {shown.map(item => {
            const q = item.quote;
            const primary = item.signals[0];
            const observation = changeObservation(item);
            const story = stories.find(story => story.symbols.includes(q.symbol));
            const href = "/stock/" + encodeURIComponent(q.symbol);
            return <article className={styles.changeCard} key={q.symbol}>
              <div className={styles.changeCardTop}>
                <Link href={href} className={styles.changeCompany}>
                  <AssetAvatar symbol={q.symbol} logoUrl={q.logoUrl} small />
                  <span><strong>{q.name}</strong><small>{q.symbol} · {formatCurrency(q.price, q.currency)}</small></span>
                </Link>
                <WatchStockButton symbol={q.symbol} name={q.name} compact className={styles.rankingWatch} />
              </div>
              <div className={styles.changeBadges}>
                <span>{changeLabels[primary.kind]}</span>
                <span className={q.changePercent > 0 ? styles.up : q.changePercent < 0 ? styles.down : styles.volume}>{formatPercent(q.changePercent)}</span>
              </div>
              <h3><Link href={href}>{observation.headline}</Link></h3>
              <p className={styles.changeEvidence}>{observation.evidence}</p>
              <Comparison signal={primary} />
              <RecentMovement item={item} />
              <div className={styles.changeStory}>
                <span>관련 소식{newsFailed && story ? " · 이전 뉴스" : ""}</span>
                {story ? <>
                  <a href={story.url} target="_blank" rel="noopener noreferrer">{story.titleKo || story.title}</a>
                  <small>{story.publisher} · {new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(story.publishedAt))} KST{story.titleKo ? " · 자동 번역" : ""}</small>
                </> : <Link href={href}>종목에서 뉴스 확인</Link>}
              </div>
            </article>;
          })}
        </div>}
      {candidates.length > 3 && <button className={styles.moreChanges} aria-expanded={expanded} aria-controls={listId}
        onClick={() => setExpanded(value => !value)}>{expanded ? "접기" : `다른 변화 ${candidates.length - 3}개 보기`}</button>}
    </HomeSection>
  );
}
