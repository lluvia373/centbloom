import Link from "next/link";
import { ArrowUpRight, BookOpen, Star, Wallet } from "lucide-react";
import { HomeWatchlist } from "./HomeWatchlist";
import styles from "./home.module.css";
export function ResearchDesk() {
  return (
    <section className={styles.desk} aria-label="나의 투자 작업">
      <div className={styles.sectionHead}>
        <div>
          <span className={styles.eyebrow}>나의 투자 공간</span>
          <h2>살펴보고, 남겨두기</h2>
        </div>
      </div>
      <p className={styles.deskIntro}>
        오늘 발견한 기업과 생각을
        <br />
        다음 판단으로 이어가세요.
      </p>
      <Link className={styles.deskAction} href="/watchlist">
        <Star size={18} />
        <span>
          <strong>관심종목 모아보기</strong>
          <small>계속 지켜볼 기업을 한곳에</small>
        </span>
        <ArrowUpRight size={15} />
      </Link>
      <Link className={styles.deskAction} href="/journal">
        <BookOpen size={18} />
        <span>
          <strong>투자 노트 남기기</strong>
          <small>관찰한 점과 매수의 이유 기록</small>
        </span>
        <ArrowUpRight size={15} />
      </Link>
      <Link className={styles.deskAction} href="/portfolio">
        <Wallet size={18} />
        <span>
          <strong>내 포트폴리오 확인</strong>
          <small>자산의 변화와 손익 살펴보기</small>
        </span>
        <ArrowUpRight size={15} />
      </Link>
      <p className={styles.note}>시장 정보는 누구나. 내 기록은 나만.</p>
      <HomeWatchlist />
    </section>
  );
}
