"use client";
import { useId, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { HomeSection } from "@/features/home/HomeSection";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import type { StockQuote } from "@/lib/types";
import { getMarketOverview, getMarketPanelTabs, getMarketPanelPage, type MarketPanelItem, type MarketPanelTab } from "./market-overview";
import { tickerSymbols, formatTickerQuote } from "./ticker-instruments";
import { useMarketClock } from "./use-market-clock";
import styles from "./MarketOverview.module.css";

const timeFormat = new Intl.DateTimeFormat("ko-KR", {
  month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  hourCycle: "h23", timeZone: "Asia/Seoul",
});
const closeDateFormat = new Intl.DateTimeFormat("ko-KR", {
  month: "numeric", day: "numeric", timeZone: "Asia/Seoul",
});

function MarketQuote({ item, quote, failed, recentClose }: {
  item: MarketPanelItem; quote?: StockQuote; failed: boolean; recentClose: boolean;
}) {
  const { group, instrument: { symbol, label, note } } = item;
  const status = recentClose && group.lastClosedAt !== undefined
    ? closeDateFormat.format(group.lastClosedAt) + " 마감"
    : group.state?.status === "open" ? "장중" : group.state?.label;
  const value = quote ? formatTickerQuote(symbol, quote) : null;
  const timestamp = quote?.quotedAt ? Date.parse(quote.quotedAt) : NaN;
  const timing = Number.isFinite(timestamp) ? timeFormat.format(timestamp) + " KST 기준" : "시세 시각 미제공";
  // The exchange schedule is not proof that this particular quote is current.
  const session = quote?.marketState === "REGULAR" ? "정규장 가격" : quote?.marketState === "CLOSED" ? "장 마감 가격" : "최근 시세";
  const delay = quote?.delayMinutes ? quote.delayMinutes + "분 지연" : "지연 가능";
  const detail = quote ? session + " · " + delay + " · " + timing + (failed ? " · 갱신 실패, 이전 가격" : "")
    : failed ? "조회 실패 · 자동 재시도 중" : "시세 불러오는 중";
  return (
    <li className={styles.item} data-symbol={symbol} tabIndex={0}
      title={label + " · " + detail + (note ? " · " + note : "")}>
      <span className={styles.label}>{label}</span>
      <strong className={value ? styles.price : styles.pending}>{value?.price ?? (failed ? "조회 불가" : "—")}</strong>
      <span className={styles.change}>{value && <span className={styles[value.direction]}>{value.change}</span>}
        {quote && failed && <span className={styles.stale}>이전</span>}
      </span>
      <span className={styles.marketState} data-open={group.state?.status === "open" || undefined}>
        {group.id !== "REFERENCE" && <>{group.label} · </>}{status ?? "참고 지표"}
      </span>
      <span className="sr-only">{detail}{note ? " · " + note : ""}</span>
    </li>
  );
}

export function MarketOverview({ initialNow }: { initialNow: number }) {
  const now = useMarketClock(initialNow);
  const overview = getMarketOverview(now);
  const tabs = getMarketPanelTabs(overview);
  const [selection, setSelection] = useState<{ id: MarketPanelTab["id"]; page: number }>({ id: "featured", page: 0 });
  const tab = tabs.find(tab => tab.id === selection.id) ?? tabs[0];
  const { items, page, pageCount } = getMarketPanelPage(tab, selection.page);
  const listId = useId();
  // Changing region/page only chooses from the same shared quote subscription.
  const { quotes, failedSymbols } = useLiveQuotes(tickerSymbols);
  return (
    <HomeSection title="주요 시장" className={styles.overview} actions={
      <nav className={styles.pagination} aria-label="주요 시장 페이지">
        <button type="button" aria-label="이전 지수" aria-controls={listId} disabled={page === 0}
          onClick={() => setSelection({ id: tab.id, page: page - 1 })}><ChevronLeft size={16} aria-hidden="true" /></button>
        <span role="status" aria-live="polite" aria-atomic="true"><span className="sr-only">{tab.label} 페이지 </span>{page + 1}/{pageCount}</span>
        <button type="button" aria-label="다음 지수" aria-controls={listId} disabled={page === pageCount - 1}
          onClick={() => setSelection({ id: tab.id, page: page + 1 })}><ChevronRight size={16} aria-hidden="true" /></button>
      </nav>
    }>
      <div className={styles.tabs} role="group" aria-label="주요 시장 선택">
        {tabs.map(option => <button key={option.id} type="button" aria-pressed={tab.id === option.id} aria-controls={listId}
          onClick={() => setSelection({ id: option.id, page: 0 })}>{option.label}</button>)}
      </div>
      <ul id={listId} className={styles.list} aria-label={(tab.id === "featured" ? overview.featuredTitle : tab.label) + " 지수"}>
        {/* Stable slots preserve focus during clock/quote refreshes; pages never auto-advance. */}
        {items.map((item, slot) => <MarketQuote key={slot} item={item} quote={quotes[item.instrument.symbol]}
          failed={failedSymbols.includes(item.instrument.symbol)} recentClose={tab.id === "featured" && overview.mode === "recent-close"} />)}
      </ul>
      <p className={styles.notice}>시세 지연 가능</p>
    </HomeSection>
  );
}
