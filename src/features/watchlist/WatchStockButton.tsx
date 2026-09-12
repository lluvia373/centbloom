"use client";
import { useState } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWatchlist } from "@/hooks/useWatchlist";
export function WatchStockButton({
  symbol,
  name,
  compact = false,
  className,
}: {
  symbol: string;
  name: string;
  compact?: boolean;
  className?: string;
}) {
  const { user, configured, loading } = useAuth();
  const { items, ready, pending, error: storageError, addItem, refresh } = useWatchlist({ loadQuotes: false });
  const [error, setError] = useState<string | null>(null);
  const failure = error ?? (compact ? null : storageError);
  const save = async () => setError(await addItem({ symbol, name, exchange: "", type: "EQUITY" }));
  const saved = items.some((item) => item.symbol === symbol);
  if (compact) {
    const needsLogin = configured && !user;
    const label = name + (saved ? " · 저장됨, 관심목록 보기" : needsLogin ? " · 로그인하고 관심종목 저장" : " · 관심종목에 담기");
    return (
      <div className={className}>
        {!loading && (needsLogin || saved) ? (
          <Link href="/watchlist" aria-label={label} title={label}>
            <Star size={18} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
          </Link>
        ) : (
          <button aria-label={label} title={label} disabled={loading || !ready || pending}
            onClick={save}>
            <Star size={18} aria-hidden="true" />
          </button>
        )}
        <span className="sr-only" role="status">{pending ? "저장 중…" : saved ? name + " 관심종목에 저장됨" : ""}</span>
        {failure && <p role="alert">{failure} <button type="button" disabled={pending} onClick={() => { setError(null); void refresh(); }}>다시 불러오기</button></p>}
      </div>
    );
  }
  if (configured && !user)
    return (
      <Link className="button-secondary" href="/watchlist">
        <Star size={15} />
        로그인하고 관심종목 저장
      </Link>
    );
  return (
    <div>
      <button
        className="button-secondary"
        disabled={loading || !ready || pending || saved}
        onClick={save}
      >
        <Star size={15} fill={saved ? "currentColor" : "none"} />
        {pending ? "저장 중…" : saved ? "관심종목에 저장됨" : "관심종목에 담기"}
      </button>
      {saved && (
        <Link className="ml-3 text-cf-caption text-cf-muted" href="/watchlist">
          목록 보기
        </Link>
      )}
      {failure && (
        <p role="alert" className="mt-2 text-cf-caption text-cf-negative">
          {failure} <button type="button" disabled={pending} onClick={() => { setError(null); void refresh(); }}>다시 불러오기</button>
        </p>
      )}
    </div>
  );
}
