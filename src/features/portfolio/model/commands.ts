import {
  parseTransactionBackup,
  TRANSACTION_BACKUP_FORMAT,
  TRANSACTION_BACKUP_VERSION,
} from "@/lib/transaction-backup";
import type { Transaction } from "@/lib/types";
import type { TransactionCommand } from "./types";
import { DEFAULT_PORTFOLIO_ID } from "./portfolios";

export function applyCommand(
  current: Transaction[],
  command: TransactionCommand,
  defaultPortfolioId = DEFAULT_PORTFOLIO_ID,
) {
  let next: Transaction[];
  let skippedCount = 0;
  switch (command.type) {
    case "createPortfolio":
    case "renamePortfolio":
    case "deletePortfolio":
    case "enrich":
      next = current;
      break;
    case "add":
    case "restore":
      if (current.some((tx) => tx.id === command.transaction.id))
        throw new Error("이미 존재하는 거래입니다.");
      next = [...current, command.transaction];
      break;
    case "update":
      if (!current.some((tx) => tx.id === command.id))
        throw new Error("수정할 거래를 찾지 못했습니다.");
      next = current.map((tx) =>
        tx.id === command.id
          ? { ...tx, ...command.changes, fee: command.changes.fee ?? 0 }
          : tx,
      );
      break;
    case "delete":
      if (!current.some((tx) => tx.id === command.id))
        throw new Error("삭제할 거래를 찾지 못했습니다.");
      next = current.filter((tx) => tx.id !== command.id);
      break;
    case "deleteHolding":
      if (!current.some((tx) => tx.symbol === command.symbol && (!command.portfolioId || tx.portfolioId === command.portfolioId)))
        throw new Error("삭제할 종목을 찾지 못했습니다.");
      next = current.filter((tx) => tx.symbol !== command.symbol || (command.portfolioId && tx.portfolioId !== command.portfolioId));
      break;
    case "import": {
      const ids = new Set(current.map((tx) => tx.id));
      const additions = command.records.filter((tx) => !ids.has(tx.id));
      skippedCount =
        command.mode === "merge"
          ? command.records.length - additions.length
          : 0;
      next =
        command.mode === "replace"
          ? [...current.filter((tx) => command.portfolioId && tx.portfolioId !== command.portfolioId), ...command.records]
          : [...current, ...additions];
      break;
    }
  }
  next = next.map((tx) => tx.portfolioId ? tx : { ...tx, portfolioId: defaultPortfolioId });
  const validation = parseTransactionBackup(
    {
      format: TRANSACTION_BACKUP_FORMAT,
      version: TRANSACTION_BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      transactions: next,
    },
    { maxTransactions: Infinity },
  );
  if (!validation.ok) throw new Error(validation.errors.join(" "));
  return {
    transactions: [...next].sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt),
    ),
    skippedCount,
  };
}
