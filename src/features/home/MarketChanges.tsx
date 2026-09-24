"use client";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useMarketChanges } from "@/features/market/use-market-changes";
import type { ChangesView } from "@/features/market/change-research";
import { useAuth } from "@/hooks/useAuth";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useWatchedReports } from "@/features/market/use-watched-reports";
import { mergeWatchedChanges, selectPersonalizedChanges } from "@/features/market/personalized-changes";
import { HomeSection } from "./HomeSection";
import { MarketChangeCard } from "./MarketChangeCard";
import styles from "./home.module.css";
import changeStyles from "./market-changes.module.css";

export function MarketChanges({ initialData }: { initialData?: ChangesView | null }) {
  const { user } = useAuth();
  const { data, failed, retry } = useMarketChanges(initialData, user?.id);
  const { items: watched } = useWatchlist({ loadQuotes: false });
  const symbols = user ? watched.map(item => item.symbol) : [];
  const reports = useWatchedReports(symbols);
  const items = mergeWatchedChanges(data?.items ?? [], symbols, reports);
  const shown = selectPersonalizedChanges(items, symbols, undefined, 3);
  const dates = [...new Set(shown.map(item => item.sessionDate))].sort();
  if (data && !items.length) return null;
  return <HomeSection title="평소와 다른 움직임" className={changeStyles.changesSection} grouped
    actions={<Link href="/movements" className={changeStyles.changeDetail}>{user ? "전체 보기" : "로그인하고 전체 보기"}<ChevronRight size={14} aria-hidden="true" /></Link>}>
    {dates.length > 0 && <div className={changeStyles.changeToolbar}><span className={styles.sectionMeta}>{dates.map(date => date.slice(5).replace("-", ".")).join(" · ")} 미국 정규장 · 지연 가능</span></div>}
    {failed && !data && !items.length && <p className={styles.note} role="status">움직임을 불러오지 못했어요. <button onClick={retry}>다시 시도</button></p>}
    {!data && !items.length && !failed ? <div className={changeStyles.changesLoading} role="status">시장 움직임을 불러오고 있어요.</div> :
      <div className={changeStyles.changeGrid}>{shown.map(item => <MarketChangeCard item={item} key={item.quote.symbol} />)}</div>}
  </HomeSection>;
}
