import type { Transaction } from "@/lib/types";
import { applyCommand } from "../model/commands";
import type { Repository, Snapshot, TransactionCommand } from "../model/types";
import type { transactionCache } from "./local";

export type SaveStatus =
  "loading" | "ready" | "saving" | "failed" | "cache-failed";
export interface LedgerState extends Snapshot {
  status: SaveStatus;
  error: string | null;
}
type Options = {
  repository: Repository;
  cache?: ReturnType<typeof transactionCache>;
  prepare?: (
    records: Transaction[],
    command: TransactionCommand,
    previous: Transaction[],
  ) => Promise<Transaction[]>;
  lock?: <T>(action: () => Promise<T>) => Promise<T>;
};
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "거래 저장을 완료하지 못했습니다.";

/** One queue owns a session's commands. Repositories own atomicity across sessions. */
export function createLedgerStore({
  repository,
  cache,
  prepare,
  lock = (action) => action(),
}: Options) {
  let state: LedgerState = {
    transactions: [],
    revision: "",
    writable: false,
    status: "loading",
    error: null,
  };
  const listeners = new Set<() => void>();
  let tail: Promise<unknown> = Promise.resolve();
  let generation = 0;
  let active = false;
  const publish = (next: Partial<LedgerState>) => {
    if (next.transactions && next.revision === state.revision)
      next = { ...next, transactions: state.transactions };
    state = { ...state, ...next };
    listeners.forEach((listener) => listener());
  };
  const enqueue = <T>(action: () => Promise<T>): Promise<T> => {
    const task = tail.then(action, action);
    tail = task.catch(() => {});
    return task;
  };
  const isCurrent = (token: number) => active && token === generation;
  const load = async (token: number) => {
    const result = await repository.read();
    if (!isCurrent(token)) return;
    // Server is authoritative. Never upload or merge browser-only records here.
    const pending = cache?.pending();
    publish({
      ...result,
      status: pending ? "failed" : "ready",
      error: pending
        ? "확인되지 않은 저장 요청이 있습니다. 재시도하거나 서버 기록을 다시 불러오세요."
        : null,
    });
  };
  const store = {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start(): Promise<void> {
      active = true;
      const token = ++generation;
      return enqueue(async () => {
        try {
          await load(token);
        } catch (error) {
          if (isCurrent(token))
            publish({ status: "failed", error: errorText(error) });
        }
      }).then(() => enrichIfNeeded(token));
    },
    dispose() {
      active = false;
      generation++;
    },
    execute(
      command: TransactionCommand,
    ): Promise<import("../model/types").TransactionImportResult> {
      const token = generation;
      const captured = structuredClone(command);
      return enqueue(() =>
        lock(async () => {
          if (!isCurrent(token))
            return {
              error: "계정이 변경되어 저장을 중단했습니다.",
              importedCount: 0,
              skippedCount: 0,
            };
          let skippedCount = 0;
          try {
            if (state.status !== "ready")
              throw new Error(
                state.error ??
                  "거래를 불러오거나 저장 중입니다. 다시 시도해 주세요.",
              );
            if (!state.writable)
              throw new Error(
                "거래 저장 서버 업데이트가 필요합니다. 기존 기록은 조회할 수 있습니다.",
              );
            publish({ status: "saving", error: null });
            // A guest tab reloads inside the shared browser lock before applying its command.
            const current = cache ? state : await repository.read();
            if (!isCurrent(token))
              throw new Error("계정이 변경되어 저장을 중단했습니다.");
            const changed = applyCommand(current.transactions, captured);
            skippedCount = changed.skippedCount;
            const next = prepare
              ? await prepare(
                  changed.transactions,
                  captured,
                  current.transactions,
                )
              : changed.transactions;
            if (!isCurrent(token))
              throw new Error("계정이 변경되어 저장을 중단했습니다.");
            const change = {
              id: crypto.randomUUID(),
              revision: current.revision,
              transactions: next,
            };
            cache?.stage(change); // A failed local journal write prevents the server write.
            const confirmed = await repository.commit(change);
            if (!isCurrent(token))
              return {
                error:
                  "계정이 변경되었습니다. 해당 계정에서 저장 결과를 확인해 주세요.",
                importedCount: 0,
                skippedCount,
              };
            publish({ ...confirmed });
            try {
              cache?.confirm(confirmed.transactions);
            } catch {
              publish({
                status: "cache-failed",
                error:
                  "서버 저장은 완료됐지만 브라우저 사본 저장에 실패했습니다. 재시도해 주세요.",
              });
              return { error: state.error, importedCount: 0, skippedCount };
            }
            publish({ status: "ready", error: null });
            return {
              error: null,
              importedCount:
                captured.type === "import"
                  ? captured.records.length - skippedCount
                  : 1,
              skippedCount,
            };
          } catch (error) {
            if (isCurrent(token)) {
              let pending = false;
              try {
                pending = Boolean(cache?.pending());
              } catch {
                pending = true;
              }
              publish({
                status: pending ? "failed" : "ready",
                error: errorText(error),
              });
            }
            return { error: errorText(error), importedCount: 0, skippedCount };
          }
        }),
      ).catch((error) => {
        if (isCurrent(token)) publish({ error: errorText(error) });
        return { error: errorText(error), importedCount: 0, skippedCount: 0 };
      });
    },
    retry(): Promise<void> {
      const token = generation;
      return enqueue(() =>
        lock(async () => {
          if (!isCurrent(token)) return;
          publish({ status: "saving", error: null });
          try {
            const pending = cache?.pending();
            if (pending) {
              await repository.commit(pending);
              if (!isCurrent(token)) return;
              // An idempotent retry may finish after another device's newer write.
              const latest = await repository.read();
              if (!isCurrent(token)) return;
              cache?.confirm(latest.transactions);
              publish({ ...latest, status: "ready", error: null });
            } else {
              await load(token);
            }
          } catch (error) {
            if (isCurrent(token))
              publish({ status: "failed", error: errorText(error) });
          }
        }),
      )
        .catch((error) => {
          if (isCurrent(token))
            publish({ status: "failed", error: errorText(error) });
        })
        .then(() => enrichIfNeeded(token));
    },
    reload(): Promise<void> {
      const token = generation;
      return enqueue(() =>
        lock(async () => {
          if (!isCurrent(token)) return;
          try {
            cache?.abandon();
            await load(token);
          } catch (error) {
            if (isCurrent(token))
              publish({ status: "failed", error: errorText(error) });
          }
        }),
      )
        .catch((error) => {
          if (isCurrent(token))
            publish({ status: "failed", error: errorText(error) });
        })
        .then(() => enrichIfNeeded(token));
    },
  };
  async function enrichIfNeeded(token: number) {
    if (
      prepare &&
      isCurrent(token) &&
      state.status === "ready" &&
      state.writable &&
      state.transactions.some(
        (tx) =>
          !tx.currency ||
          tx.fxRateToKRW == null ||
          tx.usdKrwRateAtTransaction == null,
      )
    )
      await store.execute({ type: "enrich" });
  }
  return store;
}
