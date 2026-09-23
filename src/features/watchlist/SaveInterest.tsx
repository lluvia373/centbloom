"use client";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { WatchStockButton } from "./WatchStockButton";
export function SaveInterest({ symbol }: { symbol: string }) {
  const { user } = useAuth();
  return <section className="space-y-4 rounded-cf-card border border-cf-line bg-cf-surface p-6">
    <h1 className="text-cf-title">관심종목 저장</h1>
    <p className="text-cf-section">{symbol}</p>
    {user && <p className="break-all text-cf-label text-cf-muted">저장할 계정: {user.email ?? user.id}</p>}
    <WatchStockButton key={user?.id ?? "local"} symbol={symbol} name={symbol} />
    <div className="flex flex-wrap gap-4"><Link className="button-secondary" href={`/stock/${encodeURIComponent(symbol)}`}>종목으로 돌아가기</Link><Link className="button-secondary" href="/watchlist">관심종목 보기</Link></div>
  </section>;
}
