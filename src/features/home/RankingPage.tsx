import Link from "next/link";
import { initialNews } from "@/features/market/server/news-response";
import type { MoverKind } from "@/features/market/movers-model";
import { rankingPages } from "@/features/market/ranking-pages";
import { MoverTable } from "./MoverTable";
import { MarketNews } from "./MarketNews";
import styles from "./home.module.css";

export async function RankingPage({ kind }: { kind: MoverKind }) {
  const news = await initialNews();
  return (
    <div className={[styles.home, styles.rankingPage].join(" ")}>
      <div className={styles.intro}>
        <h1>{rankingPages[kind].title}</h1>
        <Link href="/" className={styles.textLink}>시장으로</Link>
      </div>
      <div className={styles.rankingContent}>
        <nav className={styles.rankingTabs} aria-label="종목 순위 종류">
          {Object.entries(rankingPages).map(([key, page]) => (
            <Link key={key} href={page.href} aria-current={key === kind ? "page" : undefined}>
              {page.title}
            </Link>
          ))}
        </nav>
        <MoverTable key={kind} kind={kind} full />
      </div>
      <MarketNews initialData={news} />
    </div>
  );
}
