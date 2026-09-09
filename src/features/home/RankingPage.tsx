import Link from "next/link";
import type { MoverKind } from "@/features/market/movers-model";
import { rankingPages } from "@/features/market/ranking-pages";
import { MoverTable } from "./MoverTable";
import { MarketNews } from "./MarketNews";
import styles from "./home.module.css";

export function RankingPage({ kind }: { kind: MoverKind }) {
  return (
    <div className={[styles.home, styles.rankingPage].join(" ")}>
      <div className={styles.intro}>
        <h1>{rankingPages[kind].title}</h1>
        <Link href="/" className={styles.textLink}>시장으로</Link>
      </div>
      <MoverTable kind={kind} full />
      <MarketNews />
    </div>
  );
}
