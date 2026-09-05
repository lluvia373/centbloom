"use client";
import { AlertCircle } from "lucide-react";
import { usePortfolio } from "@/hooks/usePortfolio";
export function StorageNotice() {
  const { storageError } = usePortfolio();
  if (!storageError) return null;
  return (
    <div
      role="alert"
      className="mb-5 flex items-start gap-3 rounded-xl border border-[#e9d9b8] bg-[#fff9ed] px-4 py-3 text-[13px] leading-6 text-[#727680]"
    >
      <AlertCircle size={17} className="mt-1 shrink-0" />
      <div>
        <strong className="block font-semibold">
          거래 저장 공간을 확인해 주세요
        </strong>
        {storageError}
      </div>
    </div>
  );
}
