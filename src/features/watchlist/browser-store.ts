import { isBrandedStorageKey } from "@/lib/branded-storage";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { accountWatchlistRepository, localWatchlistRepository, watchlistStorageKey, type WatchlistRepository } from "./repository";
import { createWatchlistStore } from "./store";

const stores = new Map<string, ReturnType<typeof createBrowserStore>>();

function createBrowserStore(userId: string | null, configured: boolean, scope: string) {
  let storage: Storage | null = null;
  try { storage = window.localStorage; } catch { /* Account storage remains available. */ }
  const unavailable: WatchlistRepository = {
    async read() { throw new Error("브라우저 저장소에 접근할 수 없습니다. 사이트의 저장소 권한을 확인해 주세요."); },
    async commit() { throw new Error("브라우저 저장소에 접근할 수 없습니다. 사이트의 저장소 권한을 확인해 주세요."); },
  };
  const repository = configured && userId ? accountWatchlistRepository(userId, storage)
    : storage ? localWatchlistRepository(storage, watchlistStorageKey(userId)) : unavailable;
  const store = createWatchlistStore(repository);
  let subscribers = 0;
  let cleanupTimer: ReturnType<typeof setTimeout> | null = null;
  let detach: (() => void) | null = null;
  const refresh = () => { if (document.visibilityState !== "hidden") void store.refresh(); };
  return {
    ...store,
    scope,
    subscribe(listener: () => void) {
      if (cleanupTimer !== null) clearTimeout(cleanupTimer);
      cleanupTimer = null;
      subscribers++;
      const unsubscribe = store.subscribe(listener);
      if (subscribers === 1 && !detach) {
        const onStorage = (event: StorageEvent) => {
          if (isBrandedStorageKey(event.key, watchlistStorageKey(userId))) refresh();
        };
        window.addEventListener("focus", refresh);
        window.addEventListener("online", refresh);
        window.addEventListener("storage", onStorage);
        document.addEventListener("visibilitychange", refresh);
        const auth = configured ? getSupabaseBrowserClient()?.auth.onAuthStateChange((_event, session) => {
          if ((session?.user.id ?? null) !== userId) {
            store.dispose();
            if (stores.get(scope)?.getSnapshot === store.getSnapshot) stores.delete(scope);
          }
        }) : null;
        detach = () => {
          window.removeEventListener("focus", refresh);
          window.removeEventListener("online", refresh);
          window.removeEventListener("storage", onStorage);
          document.removeEventListener("visibilitychange", refresh);
          auth?.data.subscription.unsubscribe();
        };
        void store.refresh();
      }
      return () => {
        unsubscribe();
        subscribers--;
        if (subscribers === 0) cleanupTimer = setTimeout(() => {
          detach?.();
          detach = null;
          store.dispose();
          if (stores.get(scope)?.getSnapshot === store.getSnapshot) stores.delete(scope);
        }, 0);
      };
    },
  };
}

export function getWatchlistStore(userId: string | null, configured: boolean) {
  if (typeof window === "undefined" || (configured && !userId)) return null;
  const scope = (configured ? "account:" : "local:") + (userId ?? "guest");
  let store = stores.get(scope);
  if (!store) {
    store = createBrowserStore(userId, configured, scope);
    stores.set(scope, store);
  }
  return store;
}
