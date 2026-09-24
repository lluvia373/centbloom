import type { Transaction, TransactionType } from "@/lib/types";
export interface AddTransactionInput {
  portfolioId?: string;
  symbol: string;
  name: string;
  type: TransactionType;
  date: string;
  quantity: number;
  price: number;
  fee?: number;
  currency: string;
  fxRateToKRW: number;
  usdKrwRateAtTransaction: number;
}

export interface UpdateTransactionInput {
  type: TransactionType;
  date: string;
  quantity: number;
  price: number;
  fee?: number;
}

export type TransactionImportMode = "merge" | "replace";

export interface TransactionImportResult {
  error: string | null;
  importedCount: number;
  skippedCount: number;
}

export interface Snapshot {
  portfolios?: Portfolio[];
  transactions: Transaction[];
  revision: string;
  writable: boolean;
}
export interface Commit {
  portfolios?: Portfolio[];
  id: string;
  revision: string;
  transactions: Transaction[];
}
export interface Repository {
  read(): Promise<Snapshot>;
  commit(change: Commit): Promise<Snapshot>;
}
export type TransactionCommand =
  | { type: "createPortfolio"; portfolio: Portfolio }
  | { type: "renamePortfolio"; id: string; name: string }
  | { type: "deletePortfolio"; id: string; targetPortfolioId?: string }
  | { type: "enrich" }
  | { type: "add" | "restore"; transaction: Transaction }
  | { type: "update"; id: string; changes: UpdateTransactionInput }
  | { type: "delete"; id: string }
  | { type: "deleteHolding"; symbol: string; portfolioId?: string }
  | { type: "import"; records: Transaction[]; mode: TransactionImportMode; portfolioId?: string; portfolios?: Portfolio[] };

export interface Portfolio {
  id: string;
  name: string;
  createdAt: string;
  isDefault: boolean;
}
