"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileJson,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { usePortfolio, type TransactionImportMode } from "@/hooks/usePortfolio";
import {
  MAX_BACKUP_FILE_BYTES,
  parseTransactionBackup,
  serializeTransactionBackup,
  type TransactionBackup,
} from "@/lib/transaction-backup";

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function backupFileName(): string {
  const date = new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Seoul",
  });
  return `centifolio-transactions-${date}.json`;
}

export function TransactionBackupPanel() {
  const { transactions, importTransactions } = usePortfolio();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<TransactionBackup | null>(null);
  const [fileName, setFileName] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [importingMode, setImportingMode] =
    useState<TransactionImportMode | null>(null);

  const previewSummary = useMemo(() => {
    if (!preview) return null;
    const symbols = new Set(preview.transactions.map((tx) => tx.symbol));
    const dates = preview.transactions.map((tx) => tx.date).sort();
    return {
      symbolCount: symbols.size,
      firstDate: dates[0] ?? null,
      lastDate: dates.at(-1) ?? null,
    };
  }, [preview]);

  const closePreview = () => {
    if (importingMode) return;
    setPreview(null);
    setFileName("");
  };

  const handleExport = () => {
    const json = serializeTransactionBackup(transactions);
    const url = URL.createObjectURL(
      new Blob([json], { type: "application/json;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = backupFileName();
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setErrors([]);
    setNotice(
      `거래 ${transactions.length.toLocaleString("ko-KR")}건을 JSON으로 내보냈습니다.`,
    );
  };

  const handleFile = async (file: File | undefined) => {
    if (fileInputRef.current) fileInputRef.current.value = "";
    setNotice(null);
    setErrors([]);
    setPreview(null);

    if (!file) return;
    if (file.size > MAX_BACKUP_FILE_BYTES) {
      setErrors(["백업 파일은 5MB 이하여야 합니다."]);
      return;
    }

    try {
      const raw = JSON.parse(await file.text()) as unknown;
      const result = parseTransactionBackup(raw);
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      setFileName(file.name);
      setPreview(result.backup);
    } catch {
      setErrors([
        "JSON 파일을 읽을 수 없습니다. 파일이 손상되지 않았는지 확인해주세요.",
      ]);
    }
  };

  const handleImport = async (mode: TransactionImportMode) => {
    if (!preview) return;
    setImportingMode(mode);
    setErrors([]);

    try {
      const result = await importTransactions(preview.transactions, mode);
      if (result.error) {
        setErrors([result.error]);
        return;
      }
      const skipped =
        result.skippedCount > 0 ? `, 중복 ${result.skippedCount}건 제외` : "";
      setNotice(
        mode === "merge"
          ? `새 거래 ${result.importedCount}건을 병합했습니다${skipped}.`
          : `백업의 거래 ${result.importedCount}건으로 전체 교체했습니다.`,
      );
      setPreview(null);
      setFileName("");
    } catch {
      setErrors(["백업을 적용하지 못했어요. 다시 시도해 주세요."]);
    } finally {
      setImportingMode(null);
    }
  };

  return (
    <>
      <section className="rounded-2xl border border-[#e6e8eb] bg-[#ffffff] p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-[#202329]">
              <FileJson className="h-4 w-4 text-[#727680]" />
              거래 데이터 백업
            </h3>
            <p className="mt-1 text-xs leading-5 text-[#727680]">
              전체 거래를 JSON으로 보관하거나 검증된 백업을 복원합니다.
            </p>
            <p className="mt-1 text-xs leading-5 text-[#727680]">
              백업에는 실제 투자 기록이 포함되므로 안전한 장소에 보관하세요.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleExport}
              disabled={transactions.length === 0}
              title={
                transactions.length === 0
                  ? "내보낼 거래가 없습니다."
                  : undefined
              }
              className="inline-flex items-center gap-2 rounded-lg border border-[#e6e8eb] px-3 py-2 text-sm font-medium text-[#202329] transition-colors hover:bg-[#ffffff] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download className="h-4 w-4" />
              JSON 내보내기
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg bg-[#25282e] px-3 py-2 text-sm font-semibold text-[#ffffff] transition-colors hover:bg-[#25282e]"
            >
              <Upload className="h-4 w-4" />
              백업 가져오기
            </button>
            <input
              ref={fileInputRef}
              type="file"
              aria-label="거래 백업 JSON 파일 선택"
              accept="application/json,.json"
              className="sr-only"
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
          </div>
        </div>

        {notice && (
          <p
            className="mt-3 flex items-center gap-2 text-xs text-[#727680]"
            aria-live="polite"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {notice}
          </p>
        )}
        {errors.length > 0 && (
          <div
            className="mt-3 rounded-lg border border-[#edc4c4]/30 bg-[#fceeee]/10 p-3"
            role="alert"
          >
            <p className="flex items-center gap-2 text-xs font-semibold text-[#d65353]">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              백업을 적용하지 않았습니다.
            </p>
            <ul className="mt-2 space-y-1 pl-6 text-xs text-[#d65353]">
              {errors.map((error, index) => (
                <li key={`${error}-${index}`} className="list-disc">
                  {error}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {preview && previewSummary && (
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
                  이 백업을 어떻게 적용할까요?
                </h3>
                <p className="mt-1 break-all text-xs text-[#727680]">
                  {fileName}
                </p>
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
            <div className="mt-5 space-y-3">
              <button
                type="button"
                onClick={() => void handleImport("merge")}
                disabled={Boolean(importingMode)}
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
                disabled={Boolean(importingMode)}
                className="flex w-full items-center justify-between rounded-xl border border-[#edc4c4]/30 bg-[#fceeee]/10 px-4 py-3 text-left transition-colors hover:bg-[#fceeee]/15 disabled:opacity-50"
              >
                <span>
                  <span className="block text-sm font-semibold text-[#d65353]">
                    전체 교체
                  </span>
                  <span className="mt-1 block text-xs text-[#727680]">
                    현재 거래를 이 백업 내용으로 완전히 바꿉니다.
                  </span>
                </span>
                {importingMode === "replace" && (
                  <Loader2 className="h-5 w-5 animate-spin text-[#d65353]" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
