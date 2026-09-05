"use client";

import { useTransactionCommands,useTransactions } from "@/hooks/usePortfolio";
import { Loader2,X } from "lucide-react";
import { useEffect,useRef,useState } from "react";
import { TransactionList } from "./TransactionList";

export type HoldingAction = { symbol: string; name: string; action: "edit" | "delete" };

export function HoldingManagement({ target, onClose }: { target: HoldingAction | null; onClose: () => void }) {
  const { transactions } = useTransactions();
  const { updateTransaction, removeHolding } = useTransactionCommands();
  const records = transactions.filter((tx) => tx.symbol === target?.symbol);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (target?.action === "delete") dialog.current?.showModal();
    if (target?.action === "edit") {
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [target]);

  const close = () => {
    if (inFlight.current) return;
    setError(null);
    dialog.current?.close();
    onClose();
  };

  const confirmDelete = async () => {
    if (!target || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const failure = await removeHolding(target.symbol);
      if (failure) { setError(failure); return; }
      setNotice(`${target.name}의 거래 기록을 삭제했습니다.`);
      dialog.current?.close();
      onClose();
    } catch {
      setError("종목을 삭제하지 못했습니다. 연결 상태를 확인하고 다시 시도해주세요.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return <>
    {notice && <div role="status" className="mx-5 my-4 flex items-center justify-between gap-3 rounded-xl bg-[#f3f4f6] p-3 text-sm">
      {notice}<button type="button" aria-label="종목 삭제 알림 닫기" onClick={() => setNotice(null)} className="p-2"><X size={15} /></button>
    </div>}
    {target?.action === "edit" && <section className="m-4 min-w-0 rounded-xl border border-[#e6e8eb] bg-[#fafbfc] p-4" aria-label={`${target.symbol} 거래 관리`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 ref={heading} tabIndex={-1} className="font-semibold outline-none">{target.name} 수정</h3>
          <p className="mt-1 text-xs leading-5 text-[#727680]">수량·평균단가는 거래 기록으로 계산돼요. 수정할 거래의 연필 버튼을 눌러주세요.</p>
        </div>
        <button type="button" onClick={close} aria-label="종목 수정 닫기" className="rounded-lg p-2 hover:bg-white"><X size={16} /></button>
      </div>
      <TransactionList key={target.symbol} transactions={records} onUpdate={updateTransaction} initialEditId={records.length === 1 ? records[0].id : undefined} />
    </section>}
    {target?.action === "delete" && <dialog ref={dialog} aria-labelledby="delete-holding-title" aria-describedby="delete-holding-description"
      onCancel={(event) => { event.preventDefault(); close(); }}
      className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-[#e6e8eb] bg-white p-6 text-[#202329] shadow-xl backdrop:bg-black/35">
      <h3 id="delete-holding-title" className="text-lg font-semibold">{target.name}을 삭제할까요?</h3>
      <p id="delete-holding-description" className="mt-3 text-sm leading-6 text-[#727680]">{target.symbol}의 매수·매도 기록 {records.length}건을 함께 삭제합니다. 보유 목록에서 사라지고 자산과 과거 성과도 다시 계산됩니다. 실제 매도로 기록되지는 않으며, 삭제 후 되돌릴 수 없어요.</p>
      {error && <p role="alert" className="mt-3 text-sm text-[#b44848]">{error}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" autoFocus disabled={busy} onClick={close} className="button-secondary">취소</button>
        <button type="button" disabled={busy || records.length === 0} onClick={confirmDelete} className="inline-flex items-center gap-2 rounded-lg bg-[#b44848] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy && <Loader2 size={15} className="animate-spin" />}종목과 거래 삭제
        </button>
      </div>
    </dialog>}
  </>;
}
