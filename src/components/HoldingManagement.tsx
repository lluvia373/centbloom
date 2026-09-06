"use client";

import { useTransactionCommands,useTransactions } from "@/hooks/usePortfolio";
import type { Transaction } from "@/lib/types";
import { useOperationScope } from "@/shared/react/use-operation-scope";
import { Loader2,RotateCcw,X } from "lucide-react";
import { useEffect,useRef,useState } from "react";
import { TransactionList } from "./TransactionList";

export type HoldingAction = { symbol: string; name: string; action: "edit" | "delete" };

export function HoldingManagement({ target, onClose }: { target: HoldingAction | null; onClose: () => void }) {
  const { transactions } = useTransactions();
  const { updateTransaction, removeTransaction, restoreTransaction, removeHolding } = useTransactionCommands();
  const captureScope = useOperationScope("holding-management");
  const records = transactions.filter((tx) => tx.symbol === target?.symbol);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastDeleted, setLastDeleted] = useState<Transaction | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);

  useEffect(() => {
    if (target) {
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [target]);

  useEffect(() => {
    if (!lastDeleted) return;
    const timer = window.setTimeout(() => setLastDeleted(null), 8000);
    return () => window.clearTimeout(timer);
  }, [lastDeleted]);

  const undoDelete = async () => {
    if (!lastDeleted || inFlight.current) return;
    const transaction = lastDeleted;
    const isCurrent = captureScope();
    inFlight.current = true;
    setBusy(true);
    setUndoError(null);
    try {
      const failure = await restoreTransaction(transaction);
      if (!isCurrent()) return;
      if (failure) { setUndoError(failure); return; }
      setLastDeleted((current) => current?.id === transaction.id ? null : current);
    } catch {
      if (isCurrent()) setUndoError("거래를 복구하지 못했습니다. 다시 시도해주세요.");
    } finally {
      inFlight.current = false;
      if (isCurrent()) setBusy(false);
    }
  };

  const close = () => {
    if (inFlight.current) return;
    setError(null);
    dialog.current?.close();
    onClose();
  };

  const closeDelete = () => {
    if (inFlight.current) return;
    setError(null);
    dialog.current?.close();
  };

  const confirmDelete = async () => {
    if (!target || inFlight.current) return;
    const isCurrent = captureScope();
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const failure = await removeHolding(target.symbol);
      if (!isCurrent()) return;
      if (failure) { setError(failure); return; }
      setLastDeleted(null);
      setNotice(`${target.name}의 거래 기록을 삭제했습니다.`);
      dialog.current?.close();
      onClose();
    } catch {
      if (isCurrent()) setError("종목을 삭제하지 못했습니다. 연결 상태를 확인하고 다시 시도해주세요.");
    } finally {
      inFlight.current = false;
      if (isCurrent()) setBusy(false);
    }
  };

  return <>
    {lastDeleted && <div role="status" className="mx-5 my-4 rounded-xl bg-[#f3f4f6] p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>{lastDeleted.symbol} {lastDeleted.type === "buy" ? "매수" : "매도"} {lastDeleted.quantity}주 기록을 삭제했습니다.</span>
        <button type="button" disabled={busy} onClick={undoDelete} className="inline-flex items-center gap-1.5 font-semibold disabled:opacity-50"><RotateCcw size={14} />되돌리기</button>
      </div>
      {undoError && <p role="alert" className="mt-2 text-[#b44848]">{undoError}</p>}
    </div>}
    {notice && <div role="status" className="mx-5 my-4 flex items-center justify-between gap-3 rounded-xl bg-[#f3f4f6] p-3 text-sm">
      {notice}<button type="button" aria-label="종목 삭제 알림 닫기" onClick={() => setNotice(null)} className="p-2"><X size={15} /></button>
    </div>}
    {target && <section className="m-4 min-w-0 rounded-xl border border-[#e6e8eb] bg-[#fafbfc] p-4" aria-label={`${target.symbol} 거래 관리`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 ref={heading} tabIndex={-1} className="font-semibold outline-none">{target.name} 거래 관리</h3>

        </div>
        <button type="button" disabled={busy} onClick={close} aria-label="거래 관리 닫기" className="rounded-lg p-2 hover:bg-white"><X size={16} /></button>
      </div>
      <TransactionList key={`${target.symbol}:${target.action}`} transactions={records} onUpdate={updateTransaction} onRemove={removeTransaction}
        onDeleted={(transaction) => { setLastDeleted(transaction); setUndoError(null); }}
        initialEditId={target.action === "edit" && records.length === 1 ? records[0].id : undefined} />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#e6e8eb] pt-4">

        <button type="button" disabled={busy || records.length === 0} onClick={() => { setError(null); dialog.current?.showModal(); }} className="text-sm font-semibold text-[#b44848] disabled:opacity-50">이 종목의 전체 거래 삭제</button>
      </div>
    </section>}
    {target && <dialog ref={dialog} aria-labelledby="delete-holding-title" aria-describedby="delete-holding-description"
      onCancel={(event) => { event.preventDefault(); closeDelete(); }}
      className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-[#e6e8eb] bg-white p-6 text-[#202329] shadow-xl backdrop:bg-black/35">
      <h3 id="delete-holding-title" className="text-lg font-semibold">{target.name}을 삭제할까요?</h3>
      <p id="delete-holding-description" className="mt-3 text-sm leading-6 text-[#727680]">{target.symbol}의 매수·매도 기록 {records.length}건을 함께 삭제합니다. 보유 목록에서 사라지고 자산과 과거 성과도 다시 계산됩니다. 실제 매도로 기록되지는 않으며, 삭제 후 되돌릴 수 없어요.</p>
      {error && <p role="alert" className="mt-3 text-sm text-[#b44848]">{error}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" autoFocus disabled={busy} onClick={closeDelete} className="button-secondary">취소</button>
        <button type="button" disabled={busy || records.length === 0} onClick={confirmDelete} className="inline-flex items-center gap-2 rounded-lg bg-[#b44848] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy && <Loader2 size={15} className="animate-spin" />}종목과 거래 삭제
        </button>
      </div>
    </dialog>}
  </>;
}
