"use client";

import { useAuth } from "@/hooks/useAuth";
import { usePreferences, useTransactionCommands, useTransactions } from "@/hooks/usePortfolio";
import type { LedgerState } from "@/features/portfolio/data/ledger-store";
import { AlertCircle, Info } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useRef, useState } from "react";
import styles from "./StorageNotice.module.css";

type Placement = "global" | "inline";
type FeedbackProps = Pick<LedgerState, "status" | "issue" | "writable"> & {
  placement: Placement;
  pathname: string;
  preferenceError: string | null;
  onRetry: () => Promise<void>;
  onReload: (options?: { discardPending?: boolean }) => Promise<void>;
};

export function StorageNotice({ placement = "global" }: { placement?: Placement }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { status, issue, writable } = useTransactions();
  const { retryStorage, reloadTransactions } = useTransactionCommands();
  const { preferenceError } = usePreferences();
  return <StorageFeedback key={`${user?.id ?? "guest"}:${pathname}`} placement={placement}
    pathname={pathname} status={status} issue={issue} writable={writable}
    preferenceError={preferenceError} onRetry={retryStorage} onReload={reloadTransactions} />;
}

// Internal exception text never reaches this surface.
export function StorageFeedback({ placement, pathname, status, issue, writable, preferenceError, onRetry, onReload }: FeedbackProps) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const reloadButton = useRef<HTMLButtonElement>(null);
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [actionFailed, setActionFailed] = useState(false);
  const tradePage = pathname === "/portfolio" || pathname === "/transactions" || pathname === "/search";
  const unresolved = issue === "pending-save" || issue === "conflict" || issue === "cache";
  const global = placement === "global";
  if (global ? tradePage || !unresolved : !tradePage) return null;

  let message = "";
  let action: "retry" | "recover" | "currency" | null = null;
  let warning = false;
  if (status === "saving") message = "거래 기록을 확인하고 있습니다.";
  else if (issue === "pending-save") {
    message = "저장 결과를 확인하지 못한 거래가 있습니다.";
    action = "recover";
    warning = true;
  } else if (issue === "conflict") {
    message = "다른 곳에서 거래가 변경되어 이번 수정이 저장되지 않았습니다.";
    action = "recover";
    warning = true;
  } else if (issue === "cache") {
    message = "거래는 저장됐지만 이 기기에서 확인을 마치지 못했습니다.";
    action = "retry";
  } else if (issue === "load") {
    message = "거래 기록을 불러오지 못했습니다.";
    action = "retry";
    warning = true;
  } else if (status === "ready" && !writable) {
    message = "거래 추가·수정을 사용할 수 없습니다. 보유내역은 확인할 수 있습니다.";
  } else if (pathname === "/portfolio" && preferenceError) {
    message = "표시 통화 설정을 확인하지 못했습니다.";
    action = "currency";
  } else return null;

  async function run(operation: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setActionFailed(false);
    dialog.current?.close();
    try { await operation(); }
    catch { setActionFailed(true); }
    finally { locked.current = false; setBusy(false); }
  }
  const Icon = warning ? AlertCircle : Info;
  return <>
    <div className={styles.notice} role={warning ? "alert" : "status"} aria-busy={busy || status === "saving"}>
      <Icon size={16} className={warning ? styles.warning : styles.icon} aria-hidden="true" />
      <p className={styles.message}>{actionFailed ? "확인을 마치지 못했습니다. 다시 시도해 주세요." : message}</p>
      {global ? <Link className={styles.action} href="/transactions">거래 확인</Link> : <div className={styles.actions}>
        {(action === "retry" || (action === "recover" && issue !== "conflict")) && <button type="button" className={styles.action}
          disabled={busy || status === "saving"} onClick={() => void run(issue === "load" ? () => onReload() : onRetry)}>
          {busy ? "확인 중" : issue === "load" ? "다시 불러오기" : "다시 확인"}
        </button>}
        {action === "recover" && <button ref={reloadButton} type="button" className={styles.action}
          disabled={busy || status === "saving"} onClick={() => dialog.current?.showModal()}>저장된 기록 불러오기</button>}
        {action === "currency" && <Link className={styles.action} href="/settings">통화 설정</Link>}
      </div>}
    </div>
    {!global && action === "recover" && <dialog ref={dialog} className={styles.dialog} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
      onClose={() => reloadButton.current?.focus()}>
      <h2 id={`${id}-title`}>저장된 기록을 불러올까요?</h2>
      <p id={`${id}-description`}>확인되지 않은 변경은 다시 저장하지 않고, 마지막으로 저장된 기록을 불러옵니다. 불러오기에 실패하면 현재 상태를 유지합니다.</p>
      <div className={styles.dialogActions}>
        <button autoFocus type="button" className="button-secondary" onClick={() => dialog.current?.close()}>취소</button>
        <button type="button" className="button-primary" onClick={() => void run(() => onReload({ discardPending: true }))}>저장된 기록 불러오기</button>
      </div>
    </dialog>}
  </>;
}
