"use client";
import { useAuth } from "@/hooks/useAuth";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { Transaction } from "@/lib/types";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { createLedgerStore } from "../data/ledger-store";
import { localRepository, transactionCache } from "../data/local";
import { serverRepository } from "../data/server";
import { prepareTransactions } from "../model/enrichment";
import type {
  AddTransactionInput,
  TransactionImportMode,
  UpdateTransactionInput,
} from "../model/types";

const browserStorage = {
  getItem: (key: string) => window.localStorage.getItem(key),
  setItem: (key: string, value: string) =>
    window.localStorage.setItem(key, value),
  removeItem: (key: string) => window.localStorage.removeItem(key),
} as Storage;
type Store = ReturnType<typeof createLedgerStore>;
const LedgerContext = createContext<Store | null>(null);
export function LedgerProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const store = useMemo(() => {
    const client = getSupabaseBrowserClient();
    return createLedgerStore({
      repository:
        client && userId
          ? serverRepository(client, userId)
          : localRepository(browserStorage, userId),
      cache:
        client && userId ? transactionCache(browserStorage, userId) : undefined,
      prepare: prepareTransactions,
      lock: async (action) => {
        if (!navigator.locks)
          throw new Error(
            "안전한 동시 저장을 지원하는 브라우저에서 다시 시도해 주세요.",
          );
        return await navigator.locks.request(
          // Keep the lock shared with tabs opened before the brand change.
          `centifolio-ledger:${userId ?? "guest"}`,
          async () => await action(),
        );
      },
    });
  }, [userId]);
  useEffect(() => {
    void store.start();
    const changed = () => void store.reload();
    // Local guest tabs share Web Locks and reload after another tab commits.
    const onStorage = (event: StorageEvent) => {
      if (!userId && event.key === "stock-transactions") changed();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      store.dispose();
      window.removeEventListener("storage", onStorage);
    };
  }, [store, userId]);
  return (
    <LedgerContext.Provider value={store}>{children}</LedgerContext.Provider>
  );
}
function useLedgerStore() {
  const store = useContext(LedgerContext);
  if (!store) throw new Error("LedgerProvider is required");
  return store;
}
export function useTransactions() {
  const store = useLedgerStore();
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
export function useTransactionCommands() {
  const store = useLedgerStore();
  return useMemo(
    () => ({
      addTransaction: async (input: AddTransactionInput) =>
        (
          await store.execute({
            type: "add",
            transaction: {
              ...input,
              symbol: input.symbol.toUpperCase(),
              fee: input.fee ?? 0,
              id: crypto.randomUUID(),
              createdAt: new Date().toISOString(),
            },
          })
        ).error,
      updateTransaction: async (id: string, changes: UpdateTransactionInput) =>
        (await store.execute({ type: "update", id, changes })).error,
      removeTransaction: async (id: string) =>
        (await store.execute({ type: "delete", id })).error,
      removeHolding: async (symbol: string) =>
        (await store.execute({ type: "deleteHolding", symbol })).error,
      restoreTransaction: async (transaction: Transaction) =>
        (await store.execute({ type: "restore", transaction })).error,
      importTransactions: (
        records: Transaction[],
        mode: TransactionImportMode,
      ) => store.execute({ type: "import", records, mode }),
      retryStorage: () => store.retry(),
      reloadTransactions: () => store.reload(),
    }),
    [store],
  );
}
