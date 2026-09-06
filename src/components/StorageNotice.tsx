"use client";
import {
  usePreferences,
  useTransactionCommands,
  useTransactions,
} from "@/hooks/usePortfolio";
import { AlertCircle } from "lucide-react";
import { usePathname } from "next/navigation";
export function StorageNotice() {
  const pathname = usePathname();
  const { error, status, writable } = useTransactions();
  const { retryStorage, reloadTransactions } = useTransactionCommands();
  const { preferenceError } = usePreferences();
  const storageError =
    error ??
    (pathname === "/settings" ? null : preferenceError) ??
    (status === "ready" && !writable
      ? "거래 저장 서버 업데이트가 필요합니다. 기존 거래는 조회할 수 있습니다."
      : null);
  if (!storageError && status !== "saving") return null;
  return (
    <div
      role={storageError ? "alert" : "status"}
      className="mb-5 flex items-start gap-3 rounded-xl border border-[#e9d9b8] bg-[#fff9ed] px-4 py-3 text-[13px] leading-6 text-[#727680]"
    >
      <AlertCircle size={17} className="mt-1 shrink-0" />
      <div>
        <strong className="block font-semibold">
          {status === "saving"
            ? "거래를 저장하고 있어요"
            : "거래 저장 상태를 확인해 주세요"}
        </strong>
        {storageError}
        {storageError && (
          <div className="mt-2 flex gap-4">
            <button
              type="button"
              className="underline"
              disabled={status === "saving"}
              onClick={() => void retryStorage()}
            >
              저장 재시도
            </button>
            <button
              type="button"
              className="underline"
              disabled={status === "saving"}
              onClick={() => void reloadTransactions()}
            >
              기록 다시 불러오기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
