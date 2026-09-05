"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { usePathname } from "next/navigation";
import { usePortfolio } from "./usePortfolio";
import { useAuth } from "./useAuth";
import { demoSummary } from "@/lib/demo";
import type { PortfolioSummary } from "@/lib/types";

interface WorkspaceValue {
  isDemo: boolean;
  setDemo: (value: boolean) => void;
  summary: PortfolioSummary | null;
}
const WorkspaceContext = createContext<WorkspaceValue | null>(null);
const subscribe = (listener: () => void) => {
  window.addEventListener("storage", listener);
  window.addEventListener("stockfolio-mode", listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener("stockfolio-mode", listener);
  };
};

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const portfolio = usePortfolio();
  const { user } = useAuth();
  const pathname = usePathname();
  const key = `stockfolio-view:${user?.id ?? "guest"}`;
  const savedMode = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(key);
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
        window.dispatchEvent(new Event("stockfolio-mode"));
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
        (savedMode !== "personal" && portfolio.transactions.length === 0)));
  const summary = useMemo(
    () => (isDemo ? demoSummary(portfolio.displayCurrency) : portfolio.summary),
    [isDemo, portfolio.displayCurrency, portfolio.summary],
  );
  return (
    <WorkspaceContext.Provider value={{ isDemo, setDemo, summary }}>
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
