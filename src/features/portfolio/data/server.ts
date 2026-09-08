import type { SupabaseClient } from "@supabase/supabase-js";
import type { Repository, Snapshot } from "../model/types";
import {
  rowToTransaction,
  transactionToRow,
  type PortfolioTransactionRow,
} from "./rows";

export const MIGRATION_REQUIRED =
  "거래 저장 서버 업데이트가 필요합니다. 기존 기록은 유지되며 지금은 조회만 가능합니다.";
function readFailure(error: { code: string; message: string }, status: number) {
  const code = /^[A-Z0-9]{3,12}$/.test(error.code) ? error.code : null;
  const reference = code ? " (오류 " + code + ")" : status ? " (HTTP " + status + ")" : "";
  if (status === 401 || error.code === "PGRST301" || error.code === "PGRST303")
    return new Error("로그인 상태를 확인하지 못했습니다. 다시 로그인해 주세요." + reference);
  if (status === 403 || error.code === "42501")
    return new Error("거래 기록의 조회 권한을 확인하지 못했습니다." + reference);
  if (/timeout|timed out/i.test(error.message))
    return new Error("거래 조회 시간이 초과됐습니다. 기록 다시 불러오기를 눌러 주세요." + reference);
  if (status === 0)
    return new Error("거래 서버에 연결하지 못했습니다. 네트워크 연결을 확인한 뒤 다시 불러와 주세요.");
  return new Error("서버 거래를 불러오지 못했습니다. 다시 시도해 주세요." + reference);
}
function snapshot(value: {
  revision: string;
  transactions: PortfolioTransactionRow[];
}): Snapshot {
  return {
    revision: value.revision,
    transactions: value.transactions.map(rowToTransaction),
    writable: true,
  };
}
export function serverRepository(
  client: SupabaseClient,
  userId: string,
): Repository {
  return {
    async read() {
      const { data, error, status } = await client
        .rpc("read_portfolio_ledger")
        .abortSignal(AbortSignal.timeout(20_000));
      if (!error) return snapshot(data);
      if (!["PGRST202", "42883"].includes(error.code))
        throw readFailure(error, status);
      // Safe read-only compatibility before the atomic-write migration is applied.
      const records: PortfolioTransactionRow[] = [];
      for (let offset = 0; ; offset += 1000) {
        const result = await client
          .from("portfolio_transactions")
          .select("*")
          .eq("user_id", userId)
          .order("id")
          .range(offset, offset + 999)
          .abortSignal(AbortSignal.timeout(20_000));
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
        throw new Error(MIGRATION_REQUIRED);
      const { data, error } = await client
        .rpc("commit_portfolio_ledger", {
          expected_revision: change.revision,
          request_id: change.id,
          next_transactions: change.transactions.map((tx) =>
            transactionToRow(userId, tx),
          ),
        })
        .abortSignal(AbortSignal.timeout(20_000));
      if (error) {
        if (["PGRST202", "42883"].includes(error.code))
          throw new Error(MIGRATION_REQUIRED);
        if (error.code === "40001")
          throw new Error(
            "다른 기기에서 거래가 변경되었습니다. 다시 불러온 뒤 수정해 주세요.",
          );
        throw new Error(
          "서버 저장을 확인하지 못했습니다. 재시도하면 같은 요청을 확인하므로 중복 저장되지 않습니다.",
        );
      }
      return snapshot(data);
    },
  };
}
