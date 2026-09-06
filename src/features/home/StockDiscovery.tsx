"use client";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRecentSearches } from "@/features/market/use-recent-searches";
import { Search } from "lucide-react";
import Link from "next/link";
import { useStockSearch } from "@/features/market/use-stock-search";
import { AssetAvatar } from "@/components/AssetAvatar";
import styles from "./home.module.css";
export function StockDiscovery({ expanded = false }: { expanded?: boolean }) {
  const { user, loading: authLoading } = useAuth();
  const { record } = useRecentSearches(authLoading ? null : user?.id ?? null);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [retry, setRetry] = useState(0);
  const { results, loading, error } = useStockSearch(query, {
    limit: 8,
    retry,
  });
  const open = (focused || expanded) && !!query.trim();
  return (
    <div
      className={styles.discovery}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
    >
      <div className={styles.searchBox}>
        <Search size={20} />
        <input
          aria-label="종목명 또는 티커 검색"
          placeholder="종목명·티커 검색"
          value={query}
          onFocus={() => setFocused(true)}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setFocused(false);
          }}
        />

      </div>
      {open && (
        <div className={styles.searchResults} aria-label="종목 검색 결과">
          {loading ? (
            <p role="status">찾고 있어요…</p>
          ) : error ? (
            <p role="status">
              {error}
              <button onClick={() => setRetry((n) => n + 1)}>다시 시도</button>
            </p>
          ) : !results.length ? (
            <p role="status">검색 결과가 없어요. 종목 코드도 입력해보세요.</p>
          ) : (
            <ul>
              {results.map((stock) => (
                <li key={stock.symbol}>
                  <Link
                    href={"/stock/" + encodeURIComponent(stock.symbol)}
                    onClick={() => { record(stock); setFocused(false); }}
                  >
                    <AssetAvatar symbol={stock.symbol} />
                    <span>
                      <strong>{stock.name}</strong>
                      <small>
                        {stock.symbol} · {stock.exchange}
                      </small>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
