import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { AssetAvatar } from "@/components/AssetAvatar";
import { formatCurrency, formatPercent } from "@/lib/format";
import { changeObservation } from "@/features/market/market-changes";
import type { ResearchedMarketChange } from "@/features/market/change-research";
import { WatchStockButton } from "@/features/watchlist/WatchStockButton";
import styles from "./home.module.css";
import changeStyles from "./market-changes.module.css";

/** Shared presentation for the three-card preview and the complete member list. */
export function MarketChangeCard({ item }: { item: ResearchedMarketChange }) {
  const q = item.quote;
  const primary = item.signals[0];
  const observation = changeObservation(item);
  const metric = primary.kind === "volume" ? primary.ratio.toFixed(1) : primary.kind === "reversal" ? String(primary.baseline) : formatPercent(q.changePercent);
  const story = item.story;
  const href = "/stock/" + encodeURIComponent(q.symbol);
  return <article className={changeStyles.changeCard}>
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
    {story && <div className={changeStyles.changeStory}>
      <a href={story.url} target="_blank" rel="noopener noreferrer">{story.titleKo || story.title}</a>
      <small>{story.publisher} · {new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(story.publishedAt))} KST{story.titleKo ? " · 자동 번역" : ""}</small>
    </div>}
  </article>;
}
