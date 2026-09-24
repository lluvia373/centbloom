"use client";

import { useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Search, X } from "lucide-react";
import { compactUsd, quarterLabel, selectGurus, type GuruSort, type GuruSummary } from "./list-model";
import styles from "./Guru.module.css";

const PAGE_SIZE = 24;

export function GuruDirectory({ gurus, pending = [] }: { gurus: GuruSummary[]; pending?: { slug: string; name: string; manager: string; reason: string }[] }) {
  const searchId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<GuruSort>("popular");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const results = useMemo(() => selectGurus(gurus, query, sort), [gurus, query, sort]);
  return <>
    <div className={styles.directoryToolbar}>
      <div className={styles.directorySearch}>
        <Search size={18} aria-hidden="true" />
        <label className={styles.visuallyHidden} htmlFor={searchId}>구루·운용사 검색</label>
        <input ref={searchRef} id={searchId} type="search" placeholder="구루·운용사 검색" value={query} onChange={event => { setQuery(event.target.value); setLimit(PAGE_SIZE); }} />
        {query && <button type="button" aria-label="검색어 지우기" onClick={() => { setQuery(""); setLimit(PAGE_SIZE); searchRef.current?.focus(); }}><X size={16} aria-hidden="true" /></button>}
      </div>
      <div className={styles.sortOptions} role="group" aria-label="구루 정렬">
        <button type="button" aria-pressed={sort === "popular"} onClick={() => { setSort("popular"); setLimit(PAGE_SIZE); }}>인기순</button>
        <button type="button" aria-pressed={sort === "size"} onClick={() => { setSort("size"); setLimit(PAGE_SIZE); }}>규모순</button>
      </div>
    </div>
    <div className={styles.directoryContext}>
      {sort === "popular" ? <details className={styles.sortExplanation}><summary>알려진 구루 우선 · 선정 기준</summary><p>대중적 인지도와 투자 철학의 대표성을 기준으로 Centbloom이 선정한 순서입니다. 실제 조회·저장 수 순위는 아닙니다. 선정 구루 다음은 공시 규모순입니다.</p></details> : <p>분기 말 공시 금액 기준 · USD</p>}
      <span role="status" aria-live="polite">{results.length.toLocaleString("ko-KR")}개</span>
    </div>
    {results.length ? <ul className={styles.catalog}>{results.slice(0, limit).map(guru => <li className={styles.catalogItem} key={guru.slug}>
      <Link href={`/gurus/${guru.slug}`} className={styles.guruLink} prefetch={false}>
        <div className={styles.guruCardHeading}>
          <div className={styles.guruIdentity}><h2>{guru.name}</h2>{guru.manager !== guru.name && <p>{guru.manager}</p>}</div>
          <ArrowUpRight size={18} aria-hidden="true" />
        </div>
        <div className={styles.cardValue}><strong title={`공시 금액 ${guru.valueUsd.toLocaleString("ko-KR")} USD`}>{compactUsd(guru.valueUsd)}</strong><span>{quarterLabel(guru.period)}</span></div>
        <div className={styles.topHoldings} aria-label="주요 보유종목">
          {guru.topHoldings.length === 0 && <p className={styles.muted}>공시에 보고된 종목이 없습니다.</p>}
          {guru.topHoldings.map(holding => <div key={holding.name}><span>{holding.name}</span><span>{guru.valueUsd > 0 ? `${(holding.valueUsd / guru.valueUsd * 100).toFixed(1)}%` : "—"}</span></div>)}
        </div>
        <div className={styles.cardFoot}><span>{guru.holdingsCount.toLocaleString("ko-KR")}종목{guru.limitedScope ? " · 공개 보고분" : ""}</span>{guru.pendingCorrection && <span>정정 확인 중</span>}</div>
      </Link>
    </li>)}</ul> : <div className={styles.directoryEmpty}><p>{query ? "검색한 구루·운용사가 없습니다." : "확인된 구루 공시가 없습니다."}</p>{query && <button className={styles.control} type="button" onClick={() => { setQuery(""); setLimit(PAGE_SIZE); }}>전체 보기</button>}</div>}
    {results.length > limit && <div className={styles.loadMore}><button type="button" className={styles.control} onClick={() => setLimit(value => value + PAGE_SIZE)}>더 보기</button></div>}
    <p className={styles.tableNote}>분기 말 보유 보고(13F)입니다. 현재 보유 내역과 다를 수 있습니다.</p>
    {pending.length > 0 && <details className={styles.coverage}><summary>연결 확인 중인 운용사 {pending.length}개</summary><ul>{pending.map(guru => <li key={guru.slug}><span>{guru.name} · {guru.manager}</span><span>{guru.reason}</span></li>)}</ul></details>}
  </>;
}
