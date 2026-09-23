import { MarketMovers } from "@/features/home/MarketMovers";
import { LiveMarkets } from "@/components/LiveMarkets";
import styles from "@/features/home/home.module.css";
import Link from "next/link";
export default function DiscoverPage() {
  return (
    <div className={styles.home}>
      <div className={styles.intro}>
        <div>
          <h1>종목 탐색</h1>
          <Link href="/gurus" className="button-secondary">구루 포트폴리오</Link>
        </div>
      </div>
      <LiveMarkets />
      <MarketMovers />
    </div>
  );
}
