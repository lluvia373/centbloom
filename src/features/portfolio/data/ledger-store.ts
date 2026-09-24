import type { Transaction } from "@/lib/types";
import { applyCommand } from "../model/commands";
import { ALL_PORTFOLIOS_ID, DEFAULT_PORTFOLIO_ID, changePortfolios, normalizeWorkspace } from "../model/portfolios";
import type { Repository, Snapshot, TransactionCommand } from "../model/types";
import type { transactionCache } from "./local";
import { LedgerStorageError, ledgerFailure, ledgerMessage, type LedgerIssue } from "./storage-error";

export type SaveStatus =
  "loading" | "ready" | "saving" | "failed" | "cache-failed";
export interface LedgerState extends Snapshot {
  selectedPortfolioId: string;
  status: SaveStatus;
  error: string | null;
  issue: LedgerIssue | null;
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
const UNCONFIRMED_SAVE_MESSAGE = ledgerMessage("pending-save");

/** One queue owns a session's commands. Repositories own atomicity across sessions. */
export function createLedgerStore({
  repository,
  cache,
  prepare,
  lock = (action) => action(),
}: Options) {
  let state: LedgerState = {
    portfolios: [],
    selectedPortfolioId: DEFAULT_PORTFOLIO_ID,
    transactions: [],
    revision: "",
    writable: false,
    status: "loading",
    error: null,
    issue: null,
  };
  const listeners = new Set<() => void>();
  let tail: Promise<unknown> = Promise.resolve();
  let generation = 0;
  let active = false;
  const publish = (next: Partial<LedgerState>) => {
    if (next.transactions && next.revision === state.revision)
      next = { ...next, transactions: state.transactions };
    state = { ...state, ...next };
    if (state.portfolios?.length && state.selectedPortfolioId !== ALL_PORTFOLIOS_ID && !state.portfolios.some((p) => p.id === state.selectedPortfolioId))
      state = { ...state, selectedPortfolioId: state.portfolios[0].id };
    listeners.forEach((listener) => listener());
  };
  const enqueue = <T>(action: () => Promise<T>): Promise<T> => {
    const task = tail.then(action, action);
    tail = task.catch(() => {});
    return task;
  };
  const isCurrent = (token: number) => active && token === generation;
  const publishLoaded = (result: Snapshot) => {
    // Server is authoritative. Never upload or merge browser-only records here.
    let pending;
    try {
      pending = cache?.pending();
    } catch (error) {
      const failure = ledgerFailure(error, "pending-save");
      publish({ ...result, status: "failed", error: failure.message, issue: failure.issue });
      return;
    }
    const issue = pending ? state.issue === "conflict" ? "conflict" : "pending-save" : null;
    publish({
      ...result,
      status: pending ? "failed" : "ready",
      error: issue ? ledgerMessage(issue) : null,
      issue,
    });
  };
  const load = async (token: number) => {
    const result = normalizeWorkspace(await repository.read());
    if (isCurrent(token)) publishLoaded(result);
  };
  const store = {
    setSelectedPortfolioId(id: string) {
      if (id === ALL_PORTFOLIOS_ID || state.portfolios?.some((p) => p.id === id)) publish({ selectedPortfolioId: id });
    },
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
          if (isCurrent(token)) {
            const failure = ledgerFailure(error, "load");
            publish({ status: "failed", error: failure.message, issue: failure.issue });
          }
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
          let fallback: LedgerIssue = "command";
          try {
            if (state.status !== "ready")
              throw new LedgerStorageError(state.issue ?? "command",
                state.error ??
                  "거래를 불러오거나 저장 중입니다. 다시 시도해 주세요.",
              );
            // Another tab may have left a pending request since this tab last loaded.
            if (cache?.pending()) throw new LedgerStorageError("pending-save", UNCONFIRMED_SAVE_MESSAGE);
            if (!state.writable)
              throw new LedgerStorageError("command",
                "지금은 거래를 추가하거나 수정할 수 없어요. 기존 기록은 볼 수 있어요.",
              );
            publish({ status: "saving", error: null, issue: null });
            // A guest tab reloads inside the shared browser lock before applying its command.
            const current = normalizeWorkspace(cache ? state : await repository.read());
            if (!isCurrent(token))
              throw new Error("계정이 변경되어 저장을 중단했습니다.");
            let workspace, changed;
            try {
              workspace = changePortfolios(current.portfolios, current.transactions, captured);
              changed = applyCommand(workspace.transactions, captured, workspace.portfolios.find((p) => p.isDefault)?.id);
            } catch (error) {
              // These pure validators author actionable input messages, not upstream errors.
              throw new LedgerStorageError("command", error instanceof Error ? error.message : ledgerMessage("command"));
            }
            skippedCount = changed.skippedCount;
            const isPortfolioCommand = ["createPortfolio", "renamePortfolio", "deletePortfolio"].includes(captured.type);
            const next = prepare && !isPortfolioCommand
              ? await prepare(
                  changed.transactions,
                  captured,
                  current.transactions,
                )
              : changed.transactions;
            if (!isCurrent(token))
              throw new Error("계정이 변경되어 저장을 중단했습니다.");
            const normalized = normalizeWorkspace({ ...current, portfolios: workspace.portfolios, transactions: next });
            const change = {
              id: crypto.randomUUID(),
              revision: current.revision,
              transactions: normalized.transactions,
              portfolios: normalized.portfolios,
            };
            try {
              cache?.stage(change); // A failed local journal write prevents the server write.
            } catch (error) {
              ledgerFailure(error, "command");
              throw new LedgerStorageError("command", "이 브라우저에 거래를 보관하지 못해 저장을 시작하지 않았어요.");
            }
            fallback = cache ? "pending-save" : "command";
            const confirmed = normalizeWorkspace(await repository.commit(change));
            if (!isCurrent(token))
              return {
                error:
                  "계정이 변경되었습니다. 해당 계정에서 저장 결과를 확인해 주세요.",
                importedCount: 0,
                skippedCount,
              };
            const deletedSelection = captured.type === "deletePortfolio" && state.selectedPortfolioId === captured.id;
            publish({ ...confirmed, ...(deletedSelection && captured.type === "deletePortfolio" && captured.targetPortfolioId ? { selectedPortfolioId: captured.targetPortfolioId } : {}) });
            if (captured.type === "createPortfolio") publish({ selectedPortfolioId: captured.portfolio.id });
            try {
              cache?.confirm(confirmed.transactions);
            } catch {
              publish({
                status: "cache-failed",
                error: ledgerMessage("cache"),
                issue: "cache",
              });
              return { error: state.error, importedCount: 0, skippedCount };
            }
            publish({ status: "ready", error: null, issue: null });
            return {
              error: null,
              importedCount:
                captured.type === "import"
                  ? captured.records.length - skippedCount
                  : 1,
              skippedCount,
            };
          } catch (error) {
            let pending = false;
            try {
              pending = Boolean(cache?.pending());
            } catch {
              pending = true;
            }
            const failure = ledgerFailure(error, pending ? "pending-save" : fallback);
            if (isCurrent(token)) {
              publish({
                status: pending || failure.issue === "load" ? "failed" : "ready",
                error: failure.message,
                issue: failure.issue,
              });
            }
            return { error: failure.message, importedCount: 0, skippedCount };
          }
        }),
      ).catch((error) => {
        const failure = ledgerFailure(error, "command");
        if (isCurrent(token)) publish({ error: failure.message, issue: failure.issue });
        return { error: failure.message, importedCount: 0, skippedCount: 0 };
      });
    },
    retry(): Promise<void> {
      const token = generation;
      return enqueue(() =>
        lock(async () => {
          if (!isCurrent(token)) return;
          const previousIssue = state.issue;
          publish({ status: "saving", error: null, issue: null });
          let fallback: LedgerIssue = "load";
          try {
            const pending = cache?.pending();
            if (pending) {
              fallback = previousIssue === "cache" ? "cache" : "pending-save";
              await repository.commit(pending);
              if (!isCurrent(token)) return;
              // An idempotent retry may finish after another device's newer write.
              const latest = normalizeWorkspace(await repository.read());
              if (!isCurrent(token)) return;
              fallback = "cache";
              cache?.confirm(latest.transactions);
              publish({ ...latest, status: "ready", error: null, issue: null });
            } else {
              await load(token);
            }
          } catch (error) {
            if (isCurrent(token)) {
              const failure = ledgerFailure(error, fallback);
              publish({ status: failure.issue === "cache" ? "cache-failed" : "failed", error: failure.message, issue: failure.issue });
            }
          }
        }),
      )
        .catch((error) => {
          if (isCurrent(token)) {
            const failure = ledgerFailure(error, "load");
            publish({ status: "failed", error: failure.message, issue: failure.issue });
          }
        })
        .then(() => enrichIfNeeded(token));
    },
    reload(options: { discardPending?: boolean } = {}): Promise<void> {
      const token = generation;
      const unresolvedIssue = ["pending-save", "conflict", "cache"].includes(state.issue ?? "") ? state.issue : null;
      return enqueue(() =>
        lock(async () => {
          if (!isCurrent(token)) return;
          try {
            const latest = normalizeWorkspace(await repository.read());
            if (!isCurrent(token)) return;
            // Only an explicit, confirmed recovery action can retire the outbox.
            // Preserve it if the read fails or the account changes while waiting.
            if (options.discardPending) cache?.abandon();
            publishLoaded(latest);
          } catch (error) {
            if (isCurrent(token)) {
              const failure = ledgerFailure(error, "load");
              publish({ status: "failed", error: failure.message, issue: unresolvedIssue ?? failure.issue });
            }
          }
        }),
      )
        .catch((error) => {
          if (isCurrent(token)) {
            const failure = ledgerFailure(error, "load");
            publish({ status: "failed", error: failure.message, issue: unresolvedIssue ?? failure.issue });
          }
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
