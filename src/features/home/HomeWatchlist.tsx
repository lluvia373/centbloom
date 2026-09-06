"use client";
import { useAuth } from "@/hooks/useAuth";
import { useWatchlist } from "@/hooks/useWatchlist";
import { WatchlistPreview } from "@/components/WatchlistPreview";
export function HomeWatchlist() {
  const { user, configured } = useAuth();
  return user || !configured ? <SavedWatchlist /> : null;
}
function SavedWatchlist() {
  const { items } = useWatchlist({ loadQuotes: false });
  return items.length ? <WatchlistPreview /> : null;
}
