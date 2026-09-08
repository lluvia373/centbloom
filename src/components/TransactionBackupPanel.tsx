"use client";
import { BackupPreview } from "@/features/portfolio/ui/BackupPreview";
import { useAuth } from "@/hooks/useAuth";
import { useOperationScope } from "@/shared/react/use-operation-scope";

import {
  useTransactionCommands,
  useTransactions,
  type TransactionImportMode,
} from "@/hooks/usePortfolio";
import {
  MAX_BACKUP_FILE_BYTES,
  parseTransactionBackup,
  serializeTransactionBackup,
  type TransactionBackup,
} from "@/lib/transaction-backup";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileJson,
  Upload,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

function backupFileName(): string {
  const date = new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Seoul",
  });
  return `centbloom-transactions-${date}.json`;
}

export function TransactionBackupPanel() {
  const { user } = useAuth();
  return <BackupSession key={user?.id ?? "guest"} />;
}
function BackupSession() {
  const { transactions } = useTransactions();
  const { user } = useAuth();
  const captureScope = useOperationScope(user?.id ?? "guest");
  const fileVersion = useRef(0);
  const importing = useRef(false);
  const { importTransactions } = useTransactionCommands();
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
    const isCurrent = captureScope();
    const version = ++fileVersion.current;
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
      if (!isCurrent() || version !== fileVersion.current) return;
      const result = parseTransactionBackup(raw);
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      setFileName(file.name);
      setPreview(result.backup);
    } catch {
      if (!isCurrent() || version !== fileVersion.current) return;
      setErrors([
        "JSON 파일을 읽을 수 없습니다. 파일이 손상되지 않았는지 확인해주세요.",
      ]);
    }
  };

  const handleImport = async (mode: TransactionImportMode) => {
    if (!preview || importing.current) return;
    importing.current = true;
    const isCurrent = captureScope();
    setImportingMode(mode);
    setErrors([]);

    try {
      const result = await importTransactions(preview.transactions, mode);
      if (!isCurrent()) return;
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
      importing.current = false;
      if (isCurrent()) setImportingMode(null);
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
              거래 백업: 관심종목·노트 제외 · 브라우저 데이터 삭제 전 백업
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
        <BackupPreview
          preview={preview}
          previewSummary={previewSummary}
          fileName={fileName}
          closePreview={closePreview}
          importingMode={importingMode}
          errors={errors}
          handleImport={handleImport}
        />
      )}
    </>
  );
}
