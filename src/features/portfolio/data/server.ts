import { runSupabaseRequest } from "@/features/auth/session-request";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Portfolio, Repository, Snapshot } from "../model/types";
import { normalizeWorkspace } from "../model/portfolios";
import { LedgerStorageError, ledgerMessage } from "./storage-error";
import {
  rowToTransaction,
  transactionToRow,
  type PortfolioTransactionRow,
} from "./rows";

export const MIGRATION_REQUIRED =
  "지금은 거래를 추가하거나 수정할 수 없어요. 기존 기록은 볼 수 있어요.";
function readFailure(error: { code: string; message: string }, status: number) {
  const code = /^[A-Z0-9]{3,12}$/.test(error.code) ? error.code : null;
  console.warn("Portfolio read failed", { code, status });
  if (status === 401 || error.code === "PGRST301" || error.code === "PGRST303")
    return new LedgerStorageError("load", "로그인 상태를 확인하지 못했어요. 다시 로그인해 주세요.");
  if (status === 403 || error.code === "42501")
    return new LedgerStorageError("load", "거래 기록을 열지 못했어요. 잠시 후 다시 시도해 주세요.");
  if (/timeout|timed out/i.test(error.message))
    return new LedgerStorageError("load", "거래 기록을 불러오는 데 시간이 걸리고 있어요. 다시 시도해 주세요.");
  if (status === 0)
    return new LedgerStorageError("load", "연결이 끊겼어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.");
  return new LedgerStorageError("load", ledgerMessage("load"));
}
function snapshot(value: {
  revision: string;
  transactions: PortfolioTransactionRow[];
  portfolios?: { id: string; name: string; created_at: string; is_default: boolean }[];
}): Snapshot {
  return normalizeWorkspace({
    revision: value.revision,
    transactions: value.transactions.map(rowToTransaction),
    portfolios: value.portfolios?.map((row): Portfolio => ({ id: row.id, name: row.name, createdAt: row.created_at, isDefault: row.is_default })),
    writable: Array.isArray(value.portfolios),
  });
}
export function serverRepository(
  client: SupabaseClient,
  userId: string,
): Repository {
  return {
    async read() {
      const { data, error, status } = await runSupabaseRequest(client, userId, (signal) =>
        client.rpc("read_portfolio_ledger").abortSignal(signal),
      );
      if (!error) return snapshot(data);
      if (!["PGRST202", "42883"].includes(error.code))
        throw readFailure(error, status);
      // Safe read-only compatibility before the atomic-write migration is applied.
      const records: PortfolioTransactionRow[] = [];
      for (let offset = 0; ; offset += 1000) {
        const result = await runSupabaseRequest(
          client,
          userId,
          (signal) =>
            client
              .from("portfolio_transactions")
              .select("*")
              .eq("user_id", userId)
              .order("id")
              .range(offset, offset + 999).abortSignal(signal),
        );
        if (result.error) throw readFailure(result.error, result.status);
        records.push(...result.data);
        if (result.data.length < 1000) break;
      }
      return {
        transactions: records.map(rowToTransaction),
        revision: "migration-required:" + JSON.stringify(records),
        writable: false,
      };
    },
    async commit(change) {
      if (change.revision.startsWith("migration-required"))
        throw new LedgerStorageError("command", MIGRATION_REQUIRED);
      const { data, error } = await runSupabaseRequest(
        client,
        userId,
        (signal) =>
          client
            .rpc("commit_portfolio_workspace", {
              expected_revision: change.revision,
              request_id: change.id,
              next_portfolios: change.portfolios?.map((p) => ({ id: p.id, user_id: userId, name: p.name, created_at: p.createdAt, is_default: p.isDefault })),
              next_transactions: change.transactions.map((tx) =>
                transactionToRow(userId, tx),
              ),
            }).abortSignal(signal),
      );
      if (error) {
        const code = /^[A-Z0-9]{3,12}$/.test(error.code) ? error.code : null;
        console.warn("Portfolio commit failed", { code });
        if (["PGRST202", "42883"].includes(error.code))
          throw new LedgerStorageError("pending-save", MIGRATION_REQUIRED);
        if (error.code === "40001")
          throw new LedgerStorageError("conflict", ledgerMessage("conflict"));
        throw new LedgerStorageError("pending-save", ledgerMessage("pending-save"));
      }
      return snapshot(data);
    },
  };
}
