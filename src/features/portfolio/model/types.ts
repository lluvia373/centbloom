import type { Transaction, TransactionType } from "@/lib/types";
export interface AddTransactionInput {
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
  transactions: Transaction[];
  revision: string;
  writable: boolean;
}
export interface Commit {
  id: string;
  revision: string;
  transactions: Transaction[];
}
export interface Repository {
  read(): Promise<Snapshot>;
  commit(change: Commit): Promise<Snapshot>;
}
export type TransactionCommand =
  | { type: "enrich" }
  | { type: "add" | "restore"; transaction: Transaction }
  | { type: "update"; id: string; changes: UpdateTransactionInput }
  | { type: "delete"; id: string }
  | { type: "deleteHolding"; symbol: string }
  | { type: "import"; records: Transaction[]; mode: TransactionImportMode };
