"use client";

import { readBrandedStorage } from "@/lib/branded-storage";

import { demoSummary } from "@/lib/demo";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useAuth } from "./useAuth";
import {
  usePortfolioMarket,
  usePreferences,
  useTransactions,
} from "./usePortfolio";

interface WorkspaceValue {
  isDemo: boolean;
  setDemo: (value: boolean) => void;
}
const WorkspaceContext = createContext<WorkspaceValue | null>(null);
const subscribe = (listener: () => void) => {
  window.addEventListener("storage", listener);
  window.addEventListener("centifolio-mode", listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener("centifolio-mode", listener);
  };
};

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { transactions } = useTransactions();
  const { user } = useAuth();
  const pathname = usePathname();
  const key = `centifolio-view:${user?.id ?? "guest"}`;
  const savedMode = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return readBrandedStorage(localStorage, key);
      } catch {
        return null;
      }
    },
    () => null,
  );
  const [temporaryMode, setTemporaryMode] = useState<{
    key: string;
    value: boolean;
  } | null>(null);
  const setDemo = useCallback(
    (value: boolean) => {
      try {
        localStorage.setItem(key, value ? "sample" : "personal");
        setTemporaryMode(null);
        window.dispatchEvent(new Event("centifolio-mode"));
      } catch {
        setTemporaryMode({ key, value });
      }
    },
    [key],
  );
  const isTransactionRoute =
    pathname === "/search" || pathname.startsWith("/stock/");
  const isDemo =
    !isTransactionRoute &&
    ((temporaryMode?.key === key ? temporaryMode.value : null) ??
      (savedMode === "sample" ||
        (savedMode !== "personal" && transactions.length === 0)));
  const value = useMemo(() => ({ isDemo, setDemo }), [isDemo, setDemo]);
  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value)
    throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return value;
}

export function useWorkspaceSummary() {
  const mode = useWorkspace();
  const { displayCurrency } = usePreferences();
  const { summary } = usePortfolioMarket();
  return {
    ...mode,
    summary: useMemo(
      () => (mode.isDemo ? demoSummary(displayCurrency) : summary),
      [mode.isDemo, displayCurrency, summary],
    ),
  };
}
