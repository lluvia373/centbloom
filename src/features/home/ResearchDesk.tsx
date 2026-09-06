import Link from "next/link";
import { ArrowUpRight, BookOpen, Star, Wallet } from "lucide-react";
import { HomeWatchlist } from "./HomeWatchlist";
import styles from "./home.module.css";
export function ResearchDesk() {
  return (
    <section className={styles.desk} aria-label="나의 투자 작업">
      <div className={styles.sectionHead}>
        <div>
          <h2>내 투자</h2>
        </div>
      </div>
      <Link className={styles.deskAction} href="/watchlist">
        <Star size={18} />
        <span>
          <strong>관심종목 모아보기</strong>
        </span>
        <ArrowUpRight size={15} />
      </Link>
      <Link className={styles.deskAction} href="/journal">
        <BookOpen size={18} />
        <span>
          <strong>투자 노트 남기기</strong>
        </span>
        <ArrowUpRight size={15} />
      </Link>
      <Link className={styles.deskAction} href="/portfolio">
        <Wallet size={18} />
        <span>
          <strong>내 포트폴리오 확인</strong>
        </span>
        <ArrowUpRight size={15} />
      </Link>
      <HomeWatchlist />
    </section>
  );
}
