import type { Transaction } from "./types";
import { validateTransactionHistory } from "./portfolio";

export const TRANSACTION_BACKUP_FORMAT = "centifolio-transactions";
export const TRANSACTION_BACKUP_VERSION = 1;
export const MAX_BACKUP_FILE_BYTES = 5 * 1024 * 1024;

const MAX_TRANSACTION_COUNT = 20_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface TransactionBackup {
  format: typeof TRANSACTION_BACKUP_FORMAT;
  version: typeof TRANSACTION_BACKUP_VERSION;
  exportedAt: string;
  transactions: Transaction[];
}

export type TransactionBackupParseResult =
  { ok: true; backup: TransactionBackup } | { ok: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidDateOnly(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isValidTimestamp(value: string): boolean {
  return value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function optionalPositiveNumber(
  value: unknown,
  fieldName: string,
  errors: string[],
): number | undefined {
  if (value == null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    errors.push(`${fieldName} 값이 올바르지 않습니다.`);
    return undefined;
  }
  return value;
}

function parseTransaction(
  value: unknown,
  index: number,
  errors: string[],
): Transaction | null {
  const label = `${index + 1}번째 거래`;
  if (!isRecord(value)) {
    errors.push(`${label}가 객체 형식이 아닙니다.`);
    return null;
  }

  const id = typeof value.id === "string" ? value.id.trim() : "";
  const symbol =
    typeof value.symbol === "string" ? value.symbol.trim().toUpperCase() : "";
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const type = value.type;
  const date = typeof value.date === "string" ? value.date : "";
  const createdAt = typeof value.createdAt === "string" ? value.createdAt : "";

  if (!id || id.length > 128)
    errors.push(`${label}의 거래 ID가 올바르지 않습니다.`);
  if (!symbol || symbol.length > 32)
    errors.push(`${label}의 종목 코드가 올바르지 않습니다.`);
  if (!name || name.length > 200)
    errors.push(`${label}의 종목명이 올바르지 않습니다.`);
  if (type !== "buy" && type !== "sell")
    errors.push(`${label}의 거래 유형이 올바르지 않습니다.`);
  if (!isValidDateOnly(date))
    errors.push(`${label}의 거래일이 올바르지 않습니다.`);
  if (!isValidTimestamp(createdAt))
    errors.push(`${label}의 생성 시각이 올바르지 않습니다.`);

  const quantity = value.quantity;
  const price = value.price;
  const fee = value.fee;
  if (
    typeof quantity !== "number" ||
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    errors.push(`${label}의 수량은 0보다 커야 합니다.`);
  }
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    errors.push(`${label}의 단가는 0보다 커야 합니다.`);
  }
  if (typeof fee !== "number" || !Number.isFinite(fee) || fee < 0) {
    errors.push(`${label}의 수수료는 0 이상이어야 합니다.`);
  }

  let currency: string | undefined;
  if (value.currency != null) {
    currency =
      typeof value.currency === "string"
        ? value.currency.trim().toUpperCase()
        : "";
    if (!currency || currency.length > 16) {
      errors.push(`${label}의 통화 코드가 올바르지 않습니다.`);
    }
  }

  const fxRateToKRW = optionalPositiveNumber(
    value.fxRateToKRW,
    `${label}의 원화 환율`,
    errors,
  );
  const usdKrwRateAtTransaction = optionalPositiveNumber(
    value.usdKrwRateAtTransaction,
    `${label}의 달러 환율`,
    errors,
  );

  if (errors.length > 20) return null;
  if (
    !id ||
    !symbol ||
    !name ||
    (type !== "buy" && type !== "sell") ||
    !isValidDateOnly(date) ||
    !isValidTimestamp(createdAt) ||
    typeof quantity !== "number" ||
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    typeof price !== "number" ||
    !Number.isFinite(price) ||
    price <= 0 ||
    typeof fee !== "number" ||
    !Number.isFinite(fee) ||
    fee < 0 ||
    (value.currency != null && !currency)
  ) {
    return null;
  }

  return {
    id,
    symbol,
    name,
    type,
    date,
    quantity,
    price,
    fee,
    currency,
    fxRateToKRW,
    usdKrwRateAtTransaction,
    createdAt,
  };
}

export function createTransactionBackup(
  transactions: Transaction[],
  exportedAt = new Date().toISOString(),
): TransactionBackup {
  return {
    format: TRANSACTION_BACKUP_FORMAT,
    version: TRANSACTION_BACKUP_VERSION,
    exportedAt,
    transactions: [...transactions].sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt),
    ),
  };
}

export function serializeTransactionBackup(
  transactions: Transaction[],
): string {
  return JSON.stringify(createTransactionBackup(transactions), null, 2);
}

export function parseTransactionBackup(
  value: unknown,
  options: { maxTransactions?: number } = {},
): TransactionBackupParseResult {
  if (!isRecord(value)) {
    return {
      ok: false,
      errors: ["백업 파일의 최상위 형식이 올바르지 않습니다."],
    };
  }

  const errors: string[] = [];
  // Keep backups exported before the Centifolio rename importable.
  if (
    value.format !== TRANSACTION_BACKUP_FORMAT &&
    value.format !== "stockfolio-transactions"
  ) {
    errors.push("Centifolio 거래 백업 파일이 아닙니다.");
  }
  if (value.version !== TRANSACTION_BACKUP_VERSION) {
    errors.push(
      `지원하지 않는 백업 버전입니다. 현재 지원 버전은 ${TRANSACTION_BACKUP_VERSION}입니다.`,
    );
  }

  const exportedAt =
    typeof value.exportedAt === "string" ? value.exportedAt : "";
  if (!isValidTimestamp(exportedAt)) {
    errors.push("백업 생성 시각이 올바르지 않습니다.");
  }

  if (!Array.isArray(value.transactions)) {
    errors.push("거래 목록이 없습니다.");
    return { ok: false, errors };
  }
  const maxTransactions = options.maxTransactions ?? MAX_TRANSACTION_COUNT;
  if (value.transactions.length > maxTransactions) {
    errors.push(
      `한 번에 최대 ${maxTransactions.toLocaleString("ko-KR")}건까지 가져올 수 있습니다.`,
    );
    return { ok: false, errors };
  }

  const transactions: Transaction[] = [];
  for (let index = 0; index < value.transactions.length; index += 1) {
    const transaction = parseTransaction(
      value.transactions[index],
      index,
      errors,
    );
    if (transaction) transactions.push(transaction);
    if (errors.length > 20) break;
  }

  const ids = new Set<string>();
  for (const transaction of transactions) {
    if (ids.has(transaction.id)) {
      errors.push(`중복된 거래 ID가 있습니다: ${transaction.id}`);
      break;
    }
    ids.add(transaction.id);
  }

  if (errors.length === 0) {
    const historyError = validateTransactionHistory(transactions);
    if (historyError) errors.push(`거래 순서 검증 실패: ${historyError}`);
  }

  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 8) };

  return {
    ok: true,
    backup: createTransactionBackup(transactions, exportedAt),
  };
}
