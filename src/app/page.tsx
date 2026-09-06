import { connection } from "next/server";
import { StockDiscovery } from "@/features/home/StockDiscovery";
import { MarketNews } from "@/features/home/MarketNews";
import { MarketMovers } from "@/features/home/MarketMovers";
import { MarketCalendar } from "@/features/home/MarketCalendar";
import { ReadingShelf } from "@/features/home/ReadingShelf";
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
      <MarketSessions initialNow={now} />
      <div className={styles.marketMasthead}>
        <div>
          <h1 className="sr-only">시장</h1>
          <p>
            {new Intl.DateTimeFormat("ko-KR", {
              month: "long",
              day: "numeric",
              weekday: "long",
              timeZone: "Asia/Seoul",
            }).format(now)}{" "}

          </p>
        </div>
        <StockDiscovery />
      </div>
      <MarketMovers />
      <div className={styles.workspaceGrid}>
        <div className={styles.eventColumn}>
          <MarketNews />
          <ReadingShelf />
        </div>
        <aside className={styles.researchRail}>
          <MarketCalendar now={now} />
          <ResearchDesk />
        </aside>
      </div>
    </div>
  );
}
