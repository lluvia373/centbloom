import Link from "next/link";
import { BookOpen, Star, Wallet } from "lucide-react";
import { HomeWatchlist } from "./HomeWatchlist";
import { HomeSection } from "./HomeSection";
import styles from "./home.module.css";
export function ResearchDesk() {
  return (
    <HomeSection title="내 투자" label="나의 투자 작업">
      <Link className={styles.deskAction} href="/watchlist">
        <Star size={18} />
        <span>
          <strong>관심종목 모아보기</strong>
        </span>
      </Link>
      <Link className={styles.deskAction} href="/journal">
        <BookOpen size={18} />
        <span>
          <strong>투자 노트 남기기</strong>
        </span>
      </Link>
      <Link className={styles.deskAction} href="/portfolio">
        <Wallet size={18} />
        <span>
          <strong>내 포트폴리오 확인</strong>
        </span>
      </Link>
      <HomeWatchlist />
    </HomeSection>
  );
}
