"use client";

import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import styles from "./MarketTicker.module.css";

const indices = [
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^IXIC", label: "NASDAQ" },
  { symbol: "^DJI", label: "DOW" },
  { symbol: "^VIX", label: "VIX" },
  { symbol: "^KS11", label: "KOSPI" },
  { symbol: "^KQ11", label: "KOSDAQ" },
  { symbol: "KRW=X", label: "USD/KRW" },
];
const symbols = indices.map(({ symbol }) => symbol);
const priceFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const timeFormat = new Intl.DateTimeFormat("ko-KR", {
  month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  hour12: false, timeZone: "Asia/Seoul",
});

/** Market-home-only consumer of the existing shared quote subscription. */
export function MarketTicker() {
  const { quotes, failedSymbols } = useLiveQuotes(symbols);

  return (
    <section className={styles.strip} aria-label="주요 지수와 원달러 환율">
      <div className={styles.scroll} tabIndex={0} role="group" aria-label="주요 시장 시세. 좌우로 스크롤하여 모두 확인">
        <ul className={styles.list}>
          {indices.map(({ symbol, label }) => {
            const quote = quotes[symbol];
            const failed = failedSymbols.includes(symbol);
            const percent = quote?.changePercent;
            const direction = percent === undefined || percent === 0 ? "flat" : percent > 0 ? "up" : "down";
            const timestamp = quote?.quotedAt ? Date.parse(quote.quotedAt) : NaN;
            const timing = Number.isFinite(timestamp) ? `${timeFormat.format(timestamp)} KST 기준` : "시세 시각 미제공";
            const session = quote?.marketState === "REGULAR" ? "장중" : quote?.marketState === "CLOSED" ? "장 마감" : "최근 시세";
            const delay = quote?.delayMinutes ? `${quote.delayMinutes}분 지연` : "지연 가능";
            const detail = quote ? `${session} · ${delay} · ${timing}${failed ? " · 갱신 실패, 이전 가격" : ""}` : failed ? "조회 실패 · 자동 재시도 중" : "시세 불러오는 중";

            return (
              <li key={symbol} className={styles.item} tabIndex={0} title={`${label} · ${detail}`}>
                <span className={styles.label}>{label}{quote && failed && <span className={styles.stale}>이전</span>}</span>
                {quote ? <>
                  <span className={styles.values}><strong className={styles.price}>{priceFormat.format(quote.price)}</strong>
                  <span className={`${styles.change} ${styles[direction]}`}>
                    {percent! > 0 ? "+" : ""}{percent!.toFixed(2)}%
                  </span>
                  </span>
                </> : <span className={styles.pending}>{failed ? "조회 불가" : "—"}</span>}
                <span className={styles.srOnly}>{detail}</span>
              </li>
            );
          })}
        </ul>
      </div>
      <details className={styles.info} onKeyDown={event => { if (event.key === "Escape") event.currentTarget.open = false; }}>
        <summary aria-label="지연 시세 안내">지연</summary>
        <div className={styles.explanation}><p>30초마다 갱신합니다. 거래소별 지연 시세이며 휴장 중에는 최근 종가를 표시합니다. 각 지수의 기준 시각은 아래와 같습니다. VIX는 변동성 지수로, 상승이 주가 상승을 뜻하지 않습니다.</p>
        <ul>{indices.map(({symbol,label}) => {
          const time = Date.parse(quotes[symbol]?.quotedAt ?? "");
          return <li key={symbol}><span>{label}</span><span>{Number.isFinite(time) ? timeFormat.format(time) + " KST" : "시각 미제공"}</span></li>;
        })}</ul></div>
      </details>
    </section>
  );
}
