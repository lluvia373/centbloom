import type { SupabaseClient } from "@supabase/supabase-js";
import type { Repository, Snapshot } from "../model/types";
import {
  rowToTransaction,
  transactionToRow,
  type PortfolioTransactionRow,
} from "./rows";

export const MIGRATION_REQUIRED =
  "거래 저장 서버 업데이트가 필요합니다. 기존 기록은 유지되며 지금은 조회만 가능합니다.";
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
      const { data, error } = await client
        .rpc("read_portfolio_ledger")
        .abortSignal(AbortSignal.timeout(20_000));
      if (!error) return snapshot(data);
      if (!["PGRST202", "42883"].includes(error.code))
        throw new Error("서버 거래를 불러오지 못했습니다. 다시 시도해 주세요.");
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
        if (result.error) throw new Error("서버 거래를 불러오지 못했습니다.");
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
