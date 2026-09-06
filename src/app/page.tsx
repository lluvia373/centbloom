import { AdSlot } from "@/features/ads";
import { connection } from "next/server";
import { DiscoveryShortcuts } from "@/features/home/DiscoveryShortcuts";
import { StockDiscovery } from "@/features/home/StockDiscovery";
import { MarketNews } from "@/features/home/MarketNews";
import { MarketMovers } from "@/features/home/MarketMovers";
import { MarketCalendar } from "@/features/home/MarketCalendar";
import { MarketSessions } from "@/features/home/MarketSessions";
import { ResearchDesk } from "@/features/home/ResearchDesk";
import styles from "@/features/home/home.module.css";
export default async function HomePage() {
  await connection();
  // Request-time server clock, after connection().
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  return (
    <div className={styles.home}>
      <h1 className="sr-only">시장</h1>
      <div className={styles.homeSearch}>
        <StockDiscovery />
        <DiscoveryShortcuts />
      </div>
      <MarketMovers />
      <AdSlot placement="home-top" />
      <div className={styles.workspaceGrid}>
        <div className={styles.eventColumn}>
          <MarketNews />
          <AdSlot placement="home-news" />
        </div>
        <aside className={styles.researchRail}>
          <div className={styles.scheduleColumn}>
            <MarketCalendar now={now} />
            <MarketSessions initialNow={now} />
          </div>
          <ResearchDesk />
        </aside>
      </div>
    </div>
  );
}
