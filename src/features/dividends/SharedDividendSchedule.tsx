"use client";
import { useEffect, useSyncExternalStore } from "react";
import type { Transaction } from "@/lib/types";
import { sharedDividends } from "./repository";
import { DividendSchedule } from "./DividendSchedule";

/** Fetch only public symbol facts. Switching portfolios recomputes locally from the current ledger. */
export function SharedDividendSchedule({ transactions, portfolioId }: { transactions: readonly Transaction[]; portfolioId: string }) {
  const feed = useSyncExternalStore(sharedDividends.subscribe, sharedDividends.getSnapshot, sharedDividends.getServerSnapshot);
  const key = [...new Set(transactions.filter(tx => portfolioId === "all" || tx.portfolioId === portfolioId).map(tx => tx.symbol))].sort().join(",");
  useEffect(() => {
    const refresh = () => { void sharedDividends.load(key ? key.split(",") : []).catch(() => { /* Keep dated last-good facts; missing symbols remain explicit. */ }); };
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [key]);
  return <DividendSchedule transactions={transactions} portfolioId={portfolioId} feed={feed} />;
}
