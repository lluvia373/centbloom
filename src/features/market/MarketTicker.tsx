"use client";

import { useRef } from "react";
import { tickerInstruments as indices, tickerSymbols as symbols, formatTickerQuote } from "./ticker-instruments";
import { useTickerMotion } from "./use-ticker-motion";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import styles from "./MarketTicker.module.css";

const timeFormat = new Intl.DateTimeFormat("ko-KR", {
  month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  hour12: false, timeZone: "Asia/Seoul",
});

/** Shared app-header consumer of the existing shared quote subscription. */
export function MarketTicker() {
  const { quotes, failedSymbols } = useLiveQuotes(symbols);
  const viewportRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  useTickerMotion(viewportRef, listRef);

  return (
    <section className={styles.strip} aria-label="세계 주요 지수·금리·환율">
      <div ref={viewportRef} className={styles.scroll} tabIndex={0} role="group" aria-label="주요 시장 시세. 좌우로 스크롤하여 모두 확인">
        <div className={styles.track}>
        {[false, true].map(copy => (
        <ul key={String(copy)} ref={copy ? undefined : listRef} className={styles.list} aria-hidden={copy || undefined} inert={copy || undefined}>
          {indices.map(({ symbol, label, note }) => {
            const quote = quotes[symbol];
            const failed = failedSymbols.includes(symbol);
            const value = quote ? formatTickerQuote(symbol, quote) : null;
            const timestamp = quote?.quotedAt ? Date.parse(quote.quotedAt) : NaN;
            const timing = Number.isFinite(timestamp) ? `${timeFormat.format(timestamp)} KST 기준` : "시세 시각 미제공";
            const session = quote?.marketState === "REGULAR" ? "장중" : quote?.marketState === "CLOSED" ? "장 마감" : "최근 시세";
            const delay = quote?.delayMinutes ? `${quote.delayMinutes}분 지연` : "지연 가능";
            const detail = quote ? `${session} · ${delay} · ${timing}${failed ? " · 갱신 실패, 이전 가격" : ""}` : failed ? "조회 실패 · 자동 재시도 중" : "시세 불러오는 중";

            return (
              <li key={symbol} className={styles.item} tabIndex={copy ? -1 : 0} title={`${label} · ${detail}${note ? " · " + note : ""}`}>
                <span className={styles.label}>{label}{quote && failed && <span className={styles.stale}>이전</span>}</span>
                {quote ? <>
                  <span className={styles.values}><strong className={styles.price}>{value!.price}</strong>
                  <span className={`${styles.change} ${styles[value!.direction]}`}>
                    {value!.change}
                  </span>
                  </span>
                </> : <span className={styles.pending}>{failed ? "조회 불가" : "—"}</span>}
                <span className={styles.srOnly}>{detail}{note ? " · " + note : ""}</span>
              </li>
            );
          })}
        </ul>
        ))}
        </div>
      </div>
    </section>
  );
}
