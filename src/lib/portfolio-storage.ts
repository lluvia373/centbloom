import type { Transaction } from "./types";
import {
  parseTransactionBackup,
  TRANSACTION_BACKUP_FORMAT,
  TRANSACTION_BACKUP_VERSION,
} from "./transaction-backup";

export const TRANSACTIONS_KEY = "stock-transactions";
const LEGACY_HOLDINGS_KEY = "stock-portfolio";
export const STORAGE_WRITE_ERROR =
  "이 브라우저에 거래를 저장하지 못했습니다. 사이트 저장 권한과 남은 저장 공간을 확인한 뒤 다시 시도해 주세요.";
const STORAGE_READ_ERROR =
  "저장된 거래를 읽지 못했습니다. 원본 보호를 위해 거래 변경을 중지했습니다. 사이트 저장 권한 또는 저장된 데이터 형식을 확인한 뒤 새로고침해 주세요.";

type PortfolioStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type StoredTransactionsResult = {
  transactions: Transaction[];
  error: string | null;
};

export function scopedKey(baseKey: string, userId?: string | null): string {
  return userId ? `${baseKey}:${userId}` : baseKey;
}

function validatedTransactions(value: unknown): Transaction[] {
  const result = parseTransactionBackup(
    {
      format: TRANSACTION_BACKUP_FORMAT,
      version: TRANSACTION_BACKUP_VERSION,
      exportedAt: "1970-01-01T00:00:00.000Z",
      transactions: value,
    },
    { maxTransactions: Infinity },
  );
  if (!result.ok) throw new Error("Invalid stored transactions");
  // Validation must not normalize or rewrite the user's original records on read.
  return value as Transaction[];
}

export function loadStoredTransactions(
  storage: PortfolioStorage,
  userId?: string | null,
): StoredTransactionsResult {
  try {
    const transactionKey = scopedKey(TRANSACTIONS_KEY, userId);
    const raw = storage.getItem(transactionKey);
    if (raw !== null)
      return {
        transactions: validatedTransactions(JSON.parse(raw)),
        error: null,
      };

    // Keep the original one-time first-login migration, but validate and copy
    // successfully before removing the only source of the user's records.
    if (userId) {
      const unscoped = storage.getItem(TRANSACTIONS_KEY);
      if (unscoped !== null) {
        const transactions = validatedTransactions(JSON.parse(unscoped));
        storage.setItem(transactionKey, unscoped);
        storage.removeItem(TRANSACTIONS_KEY);
        return { transactions, error: null };
      }
    }

    let legacyKey = scopedKey(LEGACY_HOLDINGS_KEY, userId);
    let legacy = storage.getItem(legacyKey);
    if (legacy === null && userId) {
      legacyKey = LEGACY_HOLDINGS_KEY;
      legacy = storage.getItem(legacyKey);
    }
    if (legacy === null) return { transactions: [], error: null };

    const holdings: unknown = JSON.parse(legacy);
    if (!Array.isArray(holdings)) throw new Error("Invalid legacy holdings");
    const migrated = validatedTransactions(
      holdings.map((holding: unknown) => {
        if (!holding || typeof holding !== "object")
          throw new Error("Invalid legacy holding");
        const entry = holding as Record<string, unknown>;
        return {
          id: entry.id,
          symbol: entry.symbol,
          name: entry.name,
          type: "buy",
          date:
            typeof entry.addedAt === "string"
              ? entry.addedAt.split("T")[0]
              : "",
          quantity: entry.quantity,
          price: entry.avgCost,
          fee: 0,
          currency: entry.currency,
          createdAt: entry.addedAt,
        };
      }),
    );
    storage.setItem(transactionKey, JSON.stringify(migrated));
    storage.removeItem(legacyKey);
    return { transactions: migrated, error: null };
  } catch {
    return { transactions: [], error: STORAGE_READ_ERROR };
  }
}

export function saveStoredTransactions(
  storage: PortfolioStorage,
  transactions: Transaction[],
  userId?: string | null,
): string | null {
  try {
    storage.setItem(
      scopedKey(TRANSACTIONS_KEY, userId),
      JSON.stringify(transactions),
    );
    return null;
  } catch {
    return STORAGE_WRITE_ERROR;
  }
}
