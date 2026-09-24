"use client";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPollingStore } from "@/shared/async/polling-store";
import { createRequestCache } from "@/shared/async/request-cache";
import { fetchPreparedFeed } from "@/shared/async/prepared-feed";
import type { ChangesView } from "./change-research";
import { getSupabaseBrowserClient } from "@/lib/supabase";

const requests = createRequestCache({ concurrency: 1, maxEntries: 2 });
export async function requestMarketChanges(accountId: string | undefined, signal: AbortSignal): Promise<ChangesView> {
  if (!accountId) return fetchPreparedFeed<ChangesView>("/api/market-changes", signal);
  const client = getSupabaseBrowserClient();
  if (!client) throw new Error("로그인이 필요합니다.");
  const session = async () => {
    signal.throwIfAborted();
    const { data, error } = await client.auth.getSession();
    if (error || data.session?.user.id !== accountId) throw new Error("로그인 계정이 변경되었습니다.");
    signal.throwIfAborted();
    return data.session;
  };
  let refreshed = false;
  const result = await fetchPreparedFeed<ChangesView>("/api/market-changes?scope=all", signal, async (url, init) => {
    const current = await session();
    let response = await fetch(url, { ...init, cache: "no-store", headers: { Authorization: "Bearer " + current.access_token } });
    if (response.status === 401 && !refreshed) {
      refreshed = true;
      await session();
      const { error } = await client.auth.refreshSession();
      if (error) throw error;
      const updated = await session();
      response = await fetch(url, { ...init, cache: "no-store", headers: { Authorization: "Bearer " + updated.access_token } });
    }
    await session();
    return response;
  });
  await session();
  return result;
}
const store = createPollingStore<string, ChangesView>((key, signal) =>
  requests.request(key, signal => requestMarketChanges(key === publicKey ? undefined : key.slice(publicKey.length + 1), signal),
    { signal, ttlMs: 0, timeoutMs: 60_000 }),
);
const publicKey = "market-changes:us";
// A bounded handoff of the latest public response, not a second polling store.
// The home subscriber is gone by the time a stock-detail effect subscribes.
let recentFeed: ChangesView | undefined;
export function getCachedMarketChange(symbol: string, now = Date.now()) {
  const feed = store.snapshot(publicKey).data ?? recentFeed;
  if (!feed || feed.expiresAt <= now) return undefined;
  const item = feed.items.find(item => item.quote.symbol === symbol);
  return item ? { item, expiresAt: feed.expiresAt } : undefined;
}
let consumers = 0;
const visibility = () => store.setVisible(document.visibilityState === "visible");
export function useMarketChanges(initialData?: ChangesView | null, accountId?: string) {
  const key = accountId ? publicKey + ":" + accountId : publicKey;
  const initialView = useMemo(() => initialData ? { data: initialData, loading: false, failed: false } : store.empty, [initialData]);
  const subscribe = useCallback((listener: () => void) => {
    if (consumers++ === 0) {
      document.addEventListener("visibilitychange", visibility);
      visibility();
    }
    const stop = store.subscribe(key, listener, initialData ?? undefined);
    return () => {
      stop();
      if (--consumers === 0) document.removeEventListener("visibilitychange", visibility);
    };
  }, [initialData, key]);
  const snapshot = useCallback(() => {
    const current = store.snapshot(key);
    return current.data ? current : initialView.data && !current.failed ? initialView : current;
  }, [initialView, key]);
  const view = useSyncExternalStore(subscribe, snapshot, () => initialView);
  const [expiredAt, setExpiredAt] = useState(0);
  const expiresAt = view.data?.expiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setTimeout(() => { setExpiredAt(expiresAt); void store.refresh(key); }, Math.max(0, expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [expiresAt, key]);
  const data = view.data && view.data.expiresAt > expiredAt ? view.data : undefined;
  useEffect(() => { if (data?.access === "preview") recentFeed = data; }, [data]);
  return { ...view, data, failed: view.failed || (!!view.data && !data), retry: () => { void store.refresh(key); } };
}
