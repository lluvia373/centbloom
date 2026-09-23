import { initialChanges } from "@/features/market/server/changes-response";
import { initialNews } from "@/features/market/server/news-response";
import { connection } from "next/server";
import { Suspense } from "react";
import { DiscoveryShortcuts } from "@/features/home/DiscoveryShortcuts";
import { MarketNews } from "@/features/home/MarketNews";
import { MarketMovers } from "@/features/home/MarketMovers";
import { MarketChanges } from "@/features/home/MarketChanges";
import { MarketCalendar } from "@/features/home/MarketCalendar";
import { MarketSessions } from "@/features/home/MarketSessions";
import { MarketOverview } from "@/features/market/MarketOverview";
import { ResearchDesk } from "@/features/home/ResearchDesk";
import { HomeLayout } from "@/features/home/HomeLayout";
import styles from "@/features/home/home.module.css";
export default async function HomePage() {
  await connection();
  // Request-time server clock, after connection().
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  return (
    <div className={styles.home}>
      <h1 className="sr-only">시장</h1>
      <DiscoveryShortcuts />
      <HomeLayout
        market={<MarketOverview initialNow={now} />}
        changes={<Suspense fallback={<p className={styles.note} role="status">시장 움직임 불러오는 중</p>}><HomeChanges /></Suspense>}
        rankings={<MarketMovers compact />}
        calendar={<MarketCalendar now={now} />}
        news={<Suspense fallback={<p className={styles.note} role="status">시장 소식 불러오는 중</p>}><HomeNews /></Suspense>}
        utilities={<><MarketSessions initialNow={now} /><ResearchDesk /></>}
      />
    </div>
  );
}

// News and changes stream independently; neither blocks market, ranking or calendar.
async function HomeChanges() {
  return <MarketChanges initialData={await initialChanges()} />;
}

async function HomeNews() {
  return <MarketNews initialData={await initialNews()} />;
}
