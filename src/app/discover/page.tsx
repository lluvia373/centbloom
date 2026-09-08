import { MarketMovers } from "@/features/home/MarketMovers";
import { LiveMarkets } from "@/components/LiveMarkets";
import styles from "@/features/home/home.module.css";
export default function DiscoverPage() {
  return (
    <div className={styles.home}>
      <div className={styles.intro}>
        <div>
          <h1>종목 탐색</h1>
        </div>
      </div>
      <LiveMarkets />
      <MarketMovers />
    </div>
  );
}
