import { readBrandedStorage, removeBrandedStorage } from "@/lib/branded-storage";
import {
  loadStoredTransactions,
  saveStoredTransactions,
  scopedKey,
} from "@/lib/portfolio-storage";
import {
  parseTransactionBackup,
  TRANSACTION_BACKUP_FORMAT,
  TRANSACTION_BACKUP_VERSION,
} from "@/lib/transaction-backup";
import type { Transaction } from "@/lib/types";
import type { Commit, Repository, Snapshot } from "../model/types";
import { normalizeWorkspace } from "../model/portfolios";
import { LedgerStorageError, ledgerMessage } from "./storage-error";

export function localRepository(
  storage: Storage,
  userId: string | null,
): Repository {
  const workspaceKey = scopedKey("centbloom-portfolio-workspace", userId);
  const revision = (snapshot: Snapshot) => JSON.stringify({ portfolios: snapshot.portfolios, transactions: snapshot.transactions });
  const read = async (): Promise<Snapshot> => {
    const raw = storage.getItem(workspaceKey);
    if (raw !== null) {
      const value = JSON.parse(raw);
      if (!Array.isArray(value.portfolios) || !Array.isArray(value.transactions)) throw new Error("포트폴리오 기록을 읽지 못했습니다. 원본은 유지됩니다.");
      const parsed = parseTransactionBackup({ format: TRANSACTION_BACKUP_FORMAT, version: TRANSACTION_BACKUP_VERSION, exportedAt: "1970-01-01T00:00:00Z", transactions: value.transactions }, { maxTransactions: Infinity });
      if (!parsed.ok) throw new Error("포트폴리오 거래를 읽지 못했습니다. 원본은 유지됩니다.");
      const snapshot = normalizeWorkspace({ transactions: value.transactions, portfolios: value.portfolios, revision: "", writable: true });
      return { ...snapshot, revision: revision(snapshot) };
    }
    const result = loadStoredTransactions(storage, userId);
    if (result.error) throw new Error(result.error);
    const snapshot = normalizeWorkspace({
      transactions: result.transactions,
      revision: "",
      writable: true,
    });
    return { ...snapshot, revision: revision(snapshot) };
  };
  return {
    read,
    async commit(change) {
      const current = await read();
      const saved = storage.getItem(workspaceKey);
      if (saved && JSON.parse(saved).requestId === change.id) return current;
      if (current.revision !== change.revision)
        throw new LedgerStorageError("conflict", ledgerMessage("conflict"));
      const next = normalizeWorkspace({ ...current, transactions: change.transactions, portfolios: change.portfolios ?? current.portfolios });
      // One storage write commits folders and trades together. Legacy bytes stay untouched for recovery.
      storage.setItem(workspaceKey, JSON.stringify({ portfolios: next.portfolios, transactions: next.transactions, requestId: change.id }));
      return { ...next, revision: revision(next) };
    },
  };
}

// A recoverable outbox records the exact idempotent request before sending it.
// It never replaces the last confirmed transaction cache with unconfirmed data.
export function transactionCache(storage: Storage, userId: string | null) {
  const pendingKey = scopedKey("centbloom-pending-transaction", userId);
  return {
    pending(): Commit | null {
      const raw = readBrandedStorage(storage, pendingKey);
      if (!raw) return null;
      const value = JSON.parse(raw) as Commit;
      if (
        !value ||
        typeof value.id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          value.id,
        ) ||
        typeof value.revision !== "string" ||
        !Array.isArray(value.transactions)
      )
        throw new Error(
          "대기 중인 저장 기록을 읽지 못했습니다. 원본을 확인해 주세요.",
        );
      const parsed = parseTransactionBackup(
        {
          format: TRANSACTION_BACKUP_FORMAT,
          version: TRANSACTION_BACKUP_VERSION,
          exportedAt: "1970-01-01T00:00:00Z",
          transactions: value.transactions,
        },
        { maxTransactions: Infinity },
      );
      if (!parsed.ok)
        throw new Error(
          "대기 중인 거래가 손상되었습니다. 원본을 보존하고 기록을 다시 불러오세요.",
        );
      return value;
    },
    stage(change: Commit) {
      const previous = loadStoredTransactions(storage, userId);
      if (previous.error) throw new Error(previous.error);
      storage.setItem(pendingKey, JSON.stringify(change));
    },
    abandon() {
      const pending = readBrandedStorage(storage, pendingKey);
      if (pending) {
        storage.setItem(`${pendingKey}:recovery:${Date.now()}`, pending);
        removeBrandedStorage(storage, pendingKey);
      }
    },
    confirm(transactions: Transaction[]) {
      const previous = loadStoredTransactions(storage, userId);
      if (previous.error) throw new Error(previous.error);
      const originalKey = scopedKey("centbloom-local-original", userId);
      if (previous.transactions.length && !readBrandedStorage(storage, originalKey))
        storage.setItem(originalKey, JSON.stringify(previous.transactions));
      const error = saveStoredTransactions(storage, transactions, userId);
      if (error) throw new Error(error);
      removeBrandedStorage(storage, pendingKey);
    },
  };
}
