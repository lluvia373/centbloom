"use client";
import { type TransactionImportMode } from "@/hooks/usePortfolio";
import { type TransactionBackup } from "@/lib/transaction-backup";
import { Loader2, X } from "lucide-react";
function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function BackupPreview({
  preview,
  previewSummary,
  fileName,
  closePreview,
  importingMode,
  errors,
  handleImport,
  destinationName,
}: {
  preview: TransactionBackup;
  previewSummary: {
    symbolCount: number;
    firstDate: string | null | undefined;
    lastDate: string | null | undefined;
  };
  fileName: string;
  closePreview: () => void;
  importingMode: TransactionImportMode | null;
  errors: string[];
  handleImport: (mode: TransactionImportMode) => Promise<void>;
  destinationName?: string | null;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="backup-preview-title"
        className="w-full max-w-lg rounded-2xl border border-[#e6e8eb] bg-[#ffffff] p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#727680]">
              검증 완료
            </p>
            <h3
              id="backup-preview-title"
              className="mt-1 text-lg font-semibold text-[#202329]"
            >
              백업 복원
            </h3>
            <p className="mt-1 break-all text-xs text-[#727680]">{fileName}</p>
          </div>
          <button
            type="button"
            onClick={closePreview}
            disabled={Boolean(importingMode)}
            className="rounded-lg p-2 text-[#727680] hover:bg-[#ffffff] hover:text-[#202329] disabled:opacity-40"
            aria-label="백업 미리보기 닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-[#ffffff] p-3">
            <dt className="text-xs text-[#727680]">거래</dt>
            <dd className="mt-1 font-semibold text-[#202329]">
              {preview.transactions.length.toLocaleString("ko-KR")}건
            </dd>
          </div>
          <div className="rounded-lg bg-[#ffffff] p-3">
            <dt className="text-xs text-[#727680]">종목</dt>
            <dd className="mt-1 font-semibold text-[#202329]">
              {previewSummary.symbolCount.toLocaleString("ko-KR")}개
            </dd>
          </div>
          <div className="col-span-2 rounded-lg bg-[#ffffff] p-3">
            <dt className="text-xs text-[#727680]">거래 기간</dt>
            <dd className="mt-1 font-medium text-[#202329]">
              {previewSummary.firstDate && previewSummary.lastDate
                ? `${previewSummary.firstDate} ~ ${previewSummary.lastDate}`
                : "거래 없음"}
            </dd>
            <dd className="mt-1 text-xs text-[#727680]">
              백업 생성: {formatDateTime(preview.exportedAt)}
            </dd>
          </div>
        </dl>

        {errors.length > 0 && (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-[#f3f4f6] p-3 text-xs leading-5 text-[#d65353]"
          >
            {errors.join(" ")}
          </p>
        )}
        <p className="mt-4 text-cf-label text-cf-muted">
          {preview.portfolios ? "복원 범위: 모든 포트폴리오" : destinationName ? `가져올 곳: ${destinationName}` : "창을 닫고 거래를 가져올 포트폴리오를 먼저 선택해 주세요."}
        </p>
        <div className="mt-5 space-y-3">
          <button
            type="button"
            onClick={() => void handleImport("merge")}
            disabled={Boolean(importingMode) || (!preview.portfolios && !destinationName)}
            className="flex w-full items-center justify-between rounded-xl border border-[#e6e8eb] bg-[#f3f4f6] px-4 py-3 text-left transition-colors hover:bg-[#f3f4f6] disabled:opacity-50"
          >
            <span>
              <span className="block text-sm font-semibold text-[#727680]">
                기존 거래와 병합
              </span>
              <span className="mt-1 block text-xs text-[#727680]">
                같은 거래 ID는 유지하고 새로운 거래만 추가합니다.
              </span>
            </span>
            {importingMode === "merge" && (
              <Loader2 className="h-5 w-5 animate-spin text-[#727680]" />
            )}
          </button>
          <button
            type="button"
            onClick={() => void handleImport("replace")}
            disabled={Boolean(importingMode) || (!preview.portfolios && !destinationName)}
            className="flex w-full items-center justify-between rounded-xl border border-[#edc4c4]/30 bg-[#fceeee]/10 px-4 py-3 text-left transition-colors hover:bg-[#fceeee]/15 disabled:opacity-50"
          >
            <span>
              <span className="block text-sm font-semibold text-[#d65353]">
                {preview.portfolios ? "전체 포트폴리오 교체" : "선택한 포트폴리오 교체"}
              </span>
              <span className="mt-1 block text-xs text-[#727680]">
                {preview.portfolios ? "모든 포트폴리오와 거래를 이 백업 내용으로 완전히 바꿉니다." : "선택한 포트폴리오의 거래만 바꿉니다. 다른 포트폴리오는 유지합니다."}
              </span>
            </span>
            {importingMode === "replace" && (
              <Loader2 className="h-5 w-5 animate-spin text-[#d65353]" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
