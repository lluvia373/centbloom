"use client";
import { useId, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useMarketChanges } from "@/features/market/use-market-changes";
import { useWatchedReports } from "@/features/market/use-watched-reports";
import { mergeWatchedChanges, selectPersonalizedChanges } from "@/features/market/personalized-changes";
import { changeKinds, changeLabels, type ChangeKind } from "@/features/market/market-changes";
import { MarketChangeCard } from "./MarketChangeCard";
import styles from "./market-changes.module.css";

const PAGE_SIZE = 20;
export function MarketChangesList() {
  const { user, loading } = useAuth();
  // Remount on account change: no previous account's search/page/personal ordering survives.
  return <div className={styles.changesSection}>
    <Link href="/" className={styles.changeDetail}><ChevronLeft size={16} aria-hidden="true" />시장</Link>
    <h1 className={styles.listTitle}>평소와 다른 움직임</h1>
    {user ? <MemberChanges key={user.id} accountId={user.id} /> : <p className={styles.listStatus} role="status">{loading ? "로그인 상태를 확인하고 있어요." : "로그인하면 전체 움직임을 볼 수 있어요."}</p>}
  </div>;
}

function MemberChanges({ accountId }: { accountId: string }) {
  const { data, failed, retry } = useMarketChanges(undefined, accountId);
  const { items: watched } = useWatchlist({ loadQuotes: false });
  const symbols = watched.map(item => item.symbol);
  const reports = useWatchedReports(symbols);
  const items = data?.access === "full" ? mergeWatchedChanges(data.items, symbols, reports) : [];
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<ChangeKind>();
  const [page, setPage] = useState(0);
  const listId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const text = query.trim().toLocaleLowerCase();
  const availableKinds = changeKinds.filter(type => items.some(item => item.signals.some(signal => signal.kind === type)));
  const filtered = items.filter(item => !text || (item.quote.name + " " + item.quote.symbol).toLocaleLowerCase().includes(text));
  const candidates = selectPersonalizedChanges(filtered, symbols, kind, filtered.length);
  const pageCount = Math.ceil(candidates.length / PAGE_SIZE);
  const currentPage = Math.min(page, Math.max(0, pageCount - 1));
  const dates = [...new Set(items.map(item => item.sessionDate))].sort();
  const navigate = (value: number) => { setPage(value); heading.current?.focus(); };
  if (data?.access !== "full") return <p className={styles.listStatus} role="status">{failed ? <>전체 움직임을 불러오지 못했어요. <button onClick={retry}>다시 시도</button></> : "시장 움직임을 불러오고 있어요."}</p>;
  return <>
    <p className={styles.listMeta}>{dates.map(date => date.slice(5).replace("-", ".")).join(" · ")}{dates.length ? " · " : ""}미국 정규장 · 지연 가능</p>
    {items.length > 0 && <div className={styles.listControls}>
      <label className={styles.listSearch}><Search size={18} aria-hidden="true" /><span className="sr-only">움직임 목록에서 종목 검색</span><input type="search" placeholder="종목명 또는 티커" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} /></label>
      <div className={styles.changeFilters} aria-label="움직임 종류">
        <button aria-pressed={!kind} onClick={() => { setKind(undefined); setPage(0); }}>전체</button>
        {availableKinds.map(type => <button key={type} aria-pressed={kind === type} onClick={() => { setKind(type); setPage(0); }}>{changeLabels[type]}</button>)}
      </div>
    </div>}
    {items.length > 0 && <div className={styles.listResults}>
      <h2 ref={heading} tabIndex={-1} className={styles.resultCount} aria-live="polite">{candidates.length.toLocaleString("ko-KR")}개 종목{pageCount > 1 && ` · ${currentPage * PAGE_SIZE + 1}–${Math.min((currentPage + 1) * PAGE_SIZE, candidates.length)}`}</h2>
      {pageCount > 1 && <nav className={styles.changePagination} aria-label="움직임 목록 페이지">
        <button aria-label="이전 종목" aria-controls={listId} disabled={currentPage === 0} onClick={() => navigate(currentPage - 1)}><ChevronLeft size={16} aria-hidden="true" /></button>
        <span>{currentPage + 1} / {pageCount}</span>
        <button aria-label="다음 종목" aria-controls={listId} disabled={currentPage === pageCount - 1} onClick={() => navigate(currentPage + 1)}><ChevronRight size={16} aria-hidden="true" /></button>
      </nav>}
    </div>}
    <div id={listId} className={`${styles.changeGrid} ${styles.listGrid}`}>{candidates.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map(item => <MarketChangeCard key={item.quote.symbol} item={item} />)}</div>
    {!candidates.length && <p className={styles.listStatus}>{items.length ? "검색 조건에 맞는 종목이 없어요." : "현재 확인된 특이 움직임이 없습니다."}{items.length > 0 && <button onClick={() => { setKind(undefined); setQuery(""); setPage(0); }}>조건 지우기</button>}</p>}
    {failed && <p className={styles.listStatus} role="status">새 자료를 불러오지 못했어요. <button onClick={retry}>다시 시도</button></p>}
  </>;
}
