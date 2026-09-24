"use client";

import { useAuth } from "@/hooks/useAuth";
import { useAllTransactions, usePortfolios } from "@/hooks/usePortfolio";
import { useOperationScope } from "@/shared/react/use-operation-scope";
import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import styles from "./PortfolioSwitcher.module.css";

export function PortfolioSwitcher({ destination = false, disabled = false }: { destination?: boolean; disabled?: boolean }) {
  const { user } = useAuth();
  return <Switcher key={user?.id ?? "guest"} destination={destination} disabled={disabled} />;
}

function Switcher({ destination, disabled }: { destination: boolean; disabled: boolean }) {
  const { portfolios, selectedPortfolioId, setSelectedPortfolioId, createPortfolio, renamePortfolio, deletePortfolio, writable, status } = usePortfolios();
  const { transactions } = useAllTransactions();
  const { user } = useAuth();
  const captureScope = useOperationScope(user?.id ?? "guest");
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const firstField = useRef<HTMLInputElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const locked = useRef(false);
  const [mode, setMode] = useState<"list" | "create" | "rename" | "delete">("list");
  const [targetId, setTargetId] = useState("");
  const [name, setName] = useState("");
  const [moveTo, setMoveTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = portfolios.find(item => item.id === targetId);
  const hasTrades = transactions.some(tx => tx.portfolioId === targetId);
  const unavailable = disabled || status === "loading" || status === "saving" || !writable;
  useEffect(() => {
    if (dialog.current?.open) (firstField.current ?? closeButton.current)?.focus();
  }, [mode]);

  function chooseMode(next: typeof mode, portfolioId = "") {
    setTargetId(portfolioId);
    setName(portfolios.find(item => item.id === portfolioId)?.name ?? "");
    setMoveTo("");
    setError(null);
    setMode(next);
  }
  function close() {
    if (locked.current) return;
    dialog.current?.close();
    trigger.current?.focus();
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (locked.current || unavailable) return;
    const isCurrent = captureScope();
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      const failure = mode === "create" ? await createPortfolio(name.trim())
        : mode === "rename" ? await renamePortfolio(targetId, name.trim())
        : await deletePortfolio(targetId, hasTrades ? moveTo : undefined);
      if (!isCurrent()) return;
      if (failure) setError(failure);
      else chooseMode("list");
    } catch {
      if (isCurrent()) setError("변경을 저장하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      locked.current = false;
      if (isCurrent()) setBusy(false);
    }
  }

  return <div className={styles.switcher}>
    <select className={styles.select} aria-label={destination ? "거래를 기록할 포트폴리오" : "포트폴리오 선택"}
      value={destination && selectedPortfolioId === "all" ? "" : selectedPortfolioId}
      disabled={disabled || status === "loading" || status === "saving"}
      onChange={event => setSelectedPortfolioId(event.target.value)}>
      {destination ? <option value="" disabled>포트폴리오 선택</option> : <option value="all">전체</option>}
      {portfolios.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select>
    {!destination && <button ref={trigger} type="button" className={styles.manage} disabled={unavailable}
      aria-label="포트폴리오 관리" onClick={() => { chooseMode("list"); dialog.current?.showModal(); }}>관리</button>}
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={`${id}-title`}
      onCancel={event => { if (locked.current) event.preventDefault(); }}
      onClose={() => trigger.current?.focus()}>
      <div className={styles.heading}>
        <h2 id={`${id}-title`}>{mode === "list" ? "포트폴리오 관리" : mode === "create" ? "새 포트폴리오" : mode === "rename" ? "이름 변경" : "포트폴리오 삭제"}</h2>
        <button ref={closeButton} className={styles.close} type="button" aria-label="포트폴리오 관리 닫기" disabled={busy} onClick={close}><X size={18} aria-hidden="true" /></button>
      </div>
      {mode === "list" ? <>
        <ul className={styles.list}>{portfolios.map(item => <li className={styles.row} key={item.id}>
          <span className={styles.name}>{item.name}</span>
          <button type="button" onClick={() => chooseMode("rename", item.id)} aria-label={`${item.name} 이름 변경`}>이름 변경</button>
          <button type="button" className={styles.danger} disabled={portfolios.length <= 1} onClick={() => chooseMode("delete", item.id)} aria-label={`${item.name} 삭제`}>삭제</button>
        </li>)}</ul>
        <div className={styles.actions}><button type="button" className="button-primary" onClick={() => chooseMode("create")}>새 포트폴리오</button></div>
      </> : <form onSubmit={submit}>
        {mode === "delete" ? <>
          <p className={styles.note}>{hasTrades ? `‘${target?.name}’의 거래를 옮긴 뒤 삭제합니다.` : `‘${target?.name}’을 삭제합니다.`}</p>
          {hasTrades && <label className={styles.field}>거래를 옮길 포트폴리오
            <select className={styles.select} value={moveTo} required disabled={busy} onChange={event => setMoveTo(event.target.value)}>
              <option value="" disabled>대상 선택</option>
              {portfolios.filter(item => item.id !== targetId).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>}
        </> : <label className={styles.field}>포트폴리오 이름
          <input ref={firstField} className={styles.input} value={name} required maxLength={40} disabled={busy} onChange={event => setName(event.target.value)} />
        </label>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          <button type="button" className="button-secondary" disabled={busy} onClick={() => chooseMode("list")}>취소</button>
          <button type="submit" className="button-primary" disabled={busy || unavailable || (mode === "delete" && hasTrades && !moveTo)}>
            {busy ? "저장 중" : mode === "delete" ? hasTrades ? "옮기고 삭제" : "삭제" : "저장"}
          </button>
        </div>
      </form>}
    </dialog>
  </div>;
}
