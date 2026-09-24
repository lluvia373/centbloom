"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import styles from "./Guru.module.css";

/** Only fields displayed or searched by this table; no filing or mapping provenance. */
export interface GuruHoldingDisplayRow {
  id: string;
  issuer: string;
  security: string;
  cusip: string;
  symbol: string | null;
  value: string;
  weight: string;
  quantity: string;
  previousQuantity: string | null;
}

const PAGE_SIZE = 50;

export function GuruHoldingsTable({ visibleRows, totalCount, resultCount, query, limit, caption }: {
  visibleRows: GuruHoldingDisplayRow[]; totalCount: number; resultCount: number; query: string; limit: number; caption: string;
}) {
  const searchId = useId(), tableId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composingRef = useRef(false);
  const router = useRouter(), pathname = usePathname(), searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [input, setInput] = useState({ value: query, baseline: query });
  // Back/forward can change the server query without changing the filing key.
  // Do not let an older response overwrite text the user has already typed.
  if (input.baseline !== query) setInput({ value: input.value.trim() === input.baseline ? query : input.value, baseline: query });
  useEffect(() => () => { if (timerRef.current !== null) clearTimeout(timerRef.current); }, []);
  const cancelSearch = () => { if (timerRef.current !== null) clearTimeout(timerRef.current); timerRef.current = null; };
  const navigate = (nextQuery: string, nextLimit: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextQuery.trim()) params.set("holdingQuery", nextQuery.trim()); else params.delete("holdingQuery");
    if (nextLimit > PAGE_SIZE) params.set("holdingLimit", String(nextLimit)); else params.delete("holdingLimit");
    const suffix = params.toString();
    startTransition(() => router.replace(`${pathname}${suffix ? `?${suffix}` : ""}`, { scroll: false }));
  };
  const search = (value: string) => {
    setInput(current => ({ ...current, value }));
    cancelSearch();
    if (composingRef.current) return;
    if (!value.trim()) navigate("", PAGE_SIZE);
    else timerRef.current = setTimeout(() => { timerRef.current = null; navigate(value, PAGE_SIZE); }, 150);
  };
  const clearSearch = () => { composingRef.current = false; search(""); inputRef.current?.focus(); };
  const updating = pending || input.value.trim() !== query;

  if (!totalCount) return <div className={styles.holdingsPanel}><p className={styles.empty}>이 공시에 보고된 보유 종목이 없습니다.</p></div>;

  return <>
    <div className={styles.directoryToolbar}>
      <div className={styles.directorySearch}>
        <Search size={18} aria-hidden="true" />
        <label className={styles.visuallyHidden} htmlFor={searchId}>보유 종목 검색</label>
        <input ref={inputRef} id={searchId} type="search" placeholder="종목명·CUSIP·티커 검색" aria-controls={tableId} value={input.value}
          onChange={event => search(event.target.value)}
          onBlur={() => { if (timerRef.current !== null) { cancelSearch(); navigate(input.value, PAGE_SIZE); } }}
          onCompositionStart={() => { composingRef.current = true; cancelSearch(); }}
          onCompositionEnd={event => { composingRef.current = false; search(event.currentTarget.value); }} />
        {input.value && <button type="button" aria-label="보유 종목 검색어 지우기" onClick={clearSearch}><X size={16} aria-hidden="true" /></button>}
      </div>
    </div>
    <div className={styles.directoryContext} role="status" aria-live="polite">
      <span>{updating ? "검색 중…" : resultCount > PAGE_SIZE ? `${resultCount.toLocaleString("ko-KR")}개 중 ${visibleRows.length.toLocaleString("ko-KR")}개 표시` : `${resultCount.toLocaleString("ko-KR")}개`}</span>
    </div>
    <div id={tableId} className={styles.holdingsPanel} aria-busy={updating}>
      {visibleRows.length ? <table className={styles.holdingsTable} role="table">
        <caption className={styles.visuallyHidden}>{caption}</caption>
        <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">종목</th><th scope="col" role="columnheader">공시 금액</th><th scope="col" role="columnheader">비중</th><th scope="col" role="columnheader">보고 수량</th></tr></thead>
        <tbody role="rowgroup">{visibleRows.map(row => <tr key={row.id} role="row">
          <th scope="row" role="rowheader" className={styles.security}>
            <span className={styles.issuer}>{row.issuer}</span>
            <span className={styles.securityMeta}>{row.security}</span>
            <span className={styles.securityMeta}>CUSIP {row.cusip}{row.symbol ? ` · ${row.symbol}` : ""}</span>
          </th>
          <td role="cell" className={styles.valueCell}><span className={styles.mobileLabel} aria-hidden="true">공시 금액 · USD</span><span>{row.value}</span></td>
          <td role="cell" className={styles.weightCell}><span className={styles.mobileLabel} aria-hidden="true">비중</span><span>{row.weight}</span></td>
          <td role="cell" className={styles.quantityCell}><span className={styles.mobileLabel} aria-hidden="true">보고 수량</span><span>{row.quantity}</span>
            {row.previousQuantity !== null && <span className={styles.previousQuantity}>{row.previousQuantity}</span>}
          </td>
        </tr>)}</tbody>
      </table> : <p className={styles.empty}>검색한 보유 종목이 없습니다.</p>}
    </div>
    {resultCount > limit && <div className={styles.loadMore}><button type="button" className={styles.control} aria-controls={tableId} disabled={updating}
      onClick={() => navigate(query, limit + PAGE_SIZE)}>{Math.min(PAGE_SIZE, resultCount - limit)}개 더 보기</button></div>}
  </>;
}
