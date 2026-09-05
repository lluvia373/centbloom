"use client";
import {
  LedgerProvider,
  useTransactionCommands,
  useTransactions,
} from "@/features/portfolio/state/ledger";
import {
  PortfolioMarketProvider,
  usePortfolioMarket,
} from "@/features/portfolio/state/market";
import {
  PreferencesProvider,
  usePreferences,
} from "@/features/portfolio/state/preferences";
export type {
  TransactionImportMode,
  TransactionImportResult,
} from "@/features/portfolio/model/types";
export {
  usePortfolioMarket,
  usePreferences,
  useTransactionCommands,
  useTransactions,
};

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  return (
    <LedgerProvider>
      <PreferencesProvider>
        <PortfolioMarketProvider>{children}</PortfolioMarketProvider>
      </PreferencesProvider>
    </LedgerProvider>
  );
}
