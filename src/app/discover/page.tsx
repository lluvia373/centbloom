import { StockDiscovery } from "@/features/home/StockDiscovery";
import { MarketMovers } from "@/features/home/MarketMovers";
import { LiveMarkets } from "@/components/LiveMarkets";
import styles from "@/features/home/home.module.css";
export default function DiscoverPage() {
  return (
    <div className={styles.home}>
      <div className={styles.intro}>
        <div>
          <p className={styles.eyebrow}>EXPLORE COMPANIES</p>
          <h1>다음 관심사를 찾아보세요.</h1>
          <p className={styles.description}>
            국내부터 해외까지, 기업 이름이나 티커로 검색하세요.
          </p>
        </div>
        <StockDiscovery expanded />
      </div>
      <LiveMarkets />
      <MarketMovers />
    </div>
  );
}
