"use client";
import { useAuth } from "@/hooks/useAuth";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { scopedKey, TRANSACTIONS_KEY } from "@/lib/portfolio-storage";
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
import { ALL_PORTFOLIOS_ID } from "../model/portfolios";
import type {
  AddTransactionInput,
  TransactionImportMode,
  UpdateTransactionInput,
  Portfolio,
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
          scopedKey("centifolio-ledger", userId ?? "guest"),
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
      if (!userId && [scopedKey(TRANSACTIONS_KEY), scopedKey("centbloom-portfolio-workspace")].includes(event.key ?? "")) changed();
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
export function useAllTransactions() {
  const store = useLedgerStore();
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
export function useTransactions() {
  const state = useAllTransactions();
  return useMemo(() => ({ ...state, transactions: state.selectedPortfolioId === ALL_PORTFOLIOS_ID ? state.transactions : state.transactions.filter((tx) => tx.portfolioId === state.selectedPortfolioId) }), [state]);
}
export function usePortfolios() {
  const store = useLedgerStore();
  const state = useAllTransactions();
  return useMemo(() => ({
    portfolios: state.portfolios ?? [], selectedPortfolioId: state.selectedPortfolioId,
    isAggregate: state.selectedPortfolioId === ALL_PORTFOLIOS_ID,
    status: state.status, error: state.error, writable: state.writable,
    setSelectedPortfolioId: store.setSelectedPortfolioId,
    createPortfolio: async (name: string) => (await store.execute({ type: "createPortfolio", portfolio: { id: crypto.randomUUID(), name, createdAt: new Date().toISOString(), isDefault: false } })).error,
    renamePortfolio: async (id: string, name: string) => (await store.execute({ type: "renamePortfolio", id, name })).error,
    deletePortfolio: async (id: string, targetPortfolioId?: string) => (await store.execute({ type: "deletePortfolio", id, targetPortfolioId })).error,
  }), [state, store]);
}
export function useTransactionCommands() {
  const store = useLedgerStore();
  const { selectedPortfolioId } = useAllTransactions();
  return useMemo(
    () => ({
      addTransaction: async (input: AddTransactionInput) => {
        if (selectedPortfolioId === ALL_PORTFOLIOS_ID) return "거래를 기록할 포트폴리오를 먼저 선택해 주세요.";
        return (
          await store.execute({
            type: "add",
            transaction: {
              ...input,
              portfolioId: selectedPortfolioId,
              symbol: input.symbol.toUpperCase(),
              fee: input.fee ?? 0,
              id: crypto.randomUUID(),
              createdAt: new Date().toISOString(),
            },
          })
        ).error;
      },
      updateTransaction: async (id: string, changes: UpdateTransactionInput) =>
        (await store.execute({ type: "update", id, changes })).error,
      removeTransaction: async (id: string) =>
        (await store.execute({ type: "delete", id })).error,
      removeHolding: async (symbol: string) => selectedPortfolioId === ALL_PORTFOLIOS_ID
        ? "종목을 삭제할 포트폴리오를 먼저 선택해 주세요."
        : (await store.execute({ type: "deleteHolding", symbol, portfolioId: selectedPortfolioId })).error,
      restoreTransaction: async (transaction: Transaction) =>
        (await store.execute({ type: "restore", transaction })).error,
      importTransactions: (
        records: Transaction[],
        mode: TransactionImportMode,
        portfolios?: Portfolio[],
      ) => portfolios
        ? store.execute({ type: "import", records, mode, portfolios })
        : selectedPortfolioId === ALL_PORTFOLIOS_ID
        ? Promise.resolve({ error: "거래를 가져올 포트폴리오를 먼저 선택해 주세요.", importedCount: 0, skippedCount: 0 })
        : store.execute({ type: "import", records: records.map((tx) => ({ ...tx, portfolioId: selectedPortfolioId })), mode, portfolioId: selectedPortfolioId }),
      retryStorage: () => store.retry(),
      reloadTransactions: (options?: { discardPending?: boolean }) => store.reload(options),
    }),
    [store, selectedPortfolioId],
  );
}
