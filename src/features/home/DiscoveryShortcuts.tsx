"use client";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useRecentSearches } from "@/features/market/use-recent-searches";
import styles from "./home.module.css";

export function DiscoveryShortcuts() {
  const { user, loading } = useAuth();
  const { stocks } = useRecentSearches(loading ? null : user?.id ?? null);
  if (!stocks.length) return null;
  return (
    <nav className={styles.suggestions} aria-label="최근 검색 종목">
      <span>최근 검색</span>
      {stocks.slice(0, 3).map((stock) => (
        <Link key={stock.symbol} href={"/stock/" + encodeURIComponent(stock.symbol)} title={stock.name}>
          {stock.symbol}
        </Link>
      ))}
    </nav>
  );
}
