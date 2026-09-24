export type LedgerIssue = "load" | "pending-save" | "conflict" | "cache" | "command";

/** Only deliberately authored product messages may cross the storage boundary. */
export class LedgerStorageError extends Error {
  constructor(readonly issue: LedgerIssue, message: string) {
    super(message);
    this.name = "LedgerStorageError";
  }
}

const messages: Record<LedgerIssue, string> = {
  load: "거래 기록을 불러오지 못했어요. 다시 시도해 주세요.",
  "pending-save": "거래가 저장됐는지 확인하지 못했어요. 저장 상태를 다시 확인해 주세요.",
  conflict: "다른 화면에서 거래가 바뀌었어요. 최신 기록을 확인한 뒤 다시 수정해 주세요.",
  cache: "거래는 저장됐지만 이 브라우저의 기록을 갱신하지 못했어요.",
  command: "거래를 저장하지 못했어요. 다시 시도해 주세요.",
};

export function ledgerFailure(error: unknown, fallback: LedgerIssue) {
  if (error instanceof LedgerStorageError) return error;
  // Do not log payloads, database messages, account IDs or tokens.
  console.warn("Portfolio storage operation failed", {
    issue: fallback,
    errorType: error instanceof Error && ["Error", "TypeError", "RangeError", "AbortError", "TimeoutError", "QuotaExceededError", "SecurityError"].includes(error.name) ? error.name : "UnknownError",
  });
  return new LedgerStorageError(fallback, messages[fallback]);
}

export function ledgerMessage(issue: LedgerIssue) {
  return messages[issue];
}
