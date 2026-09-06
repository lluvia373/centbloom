"use client";
import { useState } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWatchlist } from "@/hooks/useWatchlist";
export function WatchStockButton({
  symbol,
  name,
}: {
  symbol: string;
  name: string;
}) {
  const { user, configured, loading } = useAuth();
  const { items, ready, addItem } = useWatchlist({ loadQuotes: false });
  const [error, setError] = useState<string | null>(null);
  if (configured && !user)
    return (
      <Link className="button-secondary" href="/watchlist">
        <Star size={15} />
        로그인하고 관심종목 저장
      </Link>
    );
  const saved = items.some((item) => item.symbol === symbol);
  return (
    <div>
      <button
        className="button-secondary"
        disabled={loading || !ready || saved}
        onClick={() =>
          setError(addItem({ symbol, name, exchange: "", type: "EQUITY" }))
        }
      >
        <Star size={15} fill={saved ? "currentColor" : "none"} />
        {saved ? "관심종목에 저장됨" : "관심종목에 담기"}
      </button>
      {saved && (
        <Link className="ml-3 text-xs text-[#727680]" href="/watchlist">
          목록 보기 ↗
        </Link>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
