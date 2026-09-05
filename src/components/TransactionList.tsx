"use client";

import { FormEvent, useState } from "react";
import { Loader2, Pencil, Trash2, X } from "lucide-react";
import { formatCurrency, formatDate, todayISO } from "@/lib/format";
import type { Transaction } from "@/lib/types";
import { cn } from "@/lib/utils";

type TransactionChanges = Pick<
  Transaction,
  "type" | "date" | "quantity" | "price" | "fee"
>;

interface TransactionListProps {
  transactions: Transaction[];
  onUpdate?: (
    id: string,
    changes: TransactionChanges,
  ) => Promise<string | null>;
  onRemove?: (id: string) => Promise<string | null>;
  onDeleted?: (transaction: Transaction) => void;
}

interface EditDraft {
  type: Transaction["type"];
  date: string;
  quantity: string;
  price: string;
  fee: string;
}

const inputClass =
  "w-full rounded-lg border border-[#e6e8eb] bg-[#ffffff] px-3 py-2 text-sm text-[#202329] outline-none transition-colors focus:border-[#9b9fa7]";

export function TransactionList({
  transactions,
  onUpdate,
  onRemove,
  onDeleted,
}: TransactionListProps) {
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [deleting, setDeleting] = useState<Transaction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sorted = [...transactions].sort(
    (a, b) =>
      b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  );

  const openEdit = (tx: Transaction) => {
    setDeleting(null);
    setError(null);
    setEditing(tx);
    setEditDraft({
      type: tx.type,
      date: tx.date,
      quantity: String(tx.quantity),
      price: String(tx.price),
      fee: String(tx.fee ?? 0),
    });
  };

  const closeEdit = () => {
    if (busy) return;
    setEditing(null);
    setEditDraft(null);
    setError(null);
  };

  const submitEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing || !editDraft || !onUpdate) return;

    const quantity = Number(editDraft.quantity);
    const price = Number(editDraft.price);
    const fee = Number(editDraft.fee || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("수량은 0보다 커야 합니다.");
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setError("단가는 0보다 커야 합니다.");
      return;
    }
    if (!Number.isFinite(fee) || fee < 0) {
      setError("수수료는 0 이상이어야 합니다.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const updateError = await onUpdate(editing.id, {
        type: editDraft.type,
        date: editDraft.date,
        quantity,
        price,
        fee,
      });
      if (updateError) {
        setError(updateError);
        return;
      }
      setEditing(null);
      setEditDraft(null);
    } catch {
      setError("거래를 수정하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const openDelete = (tx: Transaction) => {
    setEditing(null);
    setEditDraft(null);
    setError(null);
    setDeleting(tx);
  };

  const confirmDelete = async () => {
    if (!deleting || !onRemove) return;

    setBusy(true);
    setError(null);
    const target = deleting;
    try {
      const removeError = await onRemove(target.id);
      if (removeError) {
        setError(removeError);
        return;
      }
      setDeleting(null);
      onDeleted?.(target);
    } catch {
      setError("거래를 삭제하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  if (sorted.length === 0) {
    return (
      <div className="rounded-2xl border border-[#e6e8eb] bg-[#ffffff] p-12 text-center">
        <p className="text-[#727680]">거래 내역이 없습니다.</p>
      </div>
    );
  }

  const hasActions = Boolean(onUpdate || onRemove);

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-[#e6e8eb] bg-[#ffffff]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#e6e8eb] text-[#727680]">
                <th className="px-4 py-3 font-medium">날짜</th>
                <th className="px-4 py-3 font-medium">종목</th>
                <th className="px-4 py-3 font-medium">구분</th>
                <th className="px-4 py-3 font-medium text-right">수량</th>
                <th className="px-4 py-3 font-medium text-right">단가</th>
                <th className="px-4 py-3 font-medium text-right">금액</th>
                {hasActions && (
                  <th className="px-4 py-3 font-medium text-right">관리</th>
                )}
              </tr>
            </thead>
            <tbody>
              {sorted.map((tx) => {
                const amount =
                  tx.quantity * tx.price +
                  (tx.type === "buy" ? tx.fee : -tx.fee);
                const currency = tx.currency ?? "USD";
                return (
                  <tr
                    key={tx.id}
                    className="border-b border-[#e6e8eb] transition-colors hover:bg-[#ffffff]"
                  >
                    <td className="px-4 py-3 text-[#727680]">
                      {formatDate(tx.date)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-[#202329]">
                        {tx.symbol}
                      </span>
                      <span className="ml-2 text-xs text-[#727680]">
                        {tx.name}
                      </span>
                      <span className="ml-2 text-xs uppercase text-[#727680]">
                        {currency}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          tx.type === "buy"
                            ? "bg-[#f3f4f6] text-[#727680]"
                            : "bg-[#fceeee]/10 text-[#d65353]",
                        )}
                      >
                        {tx.type === "buy" ? "매수" : "매도"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-[#727680]">
                      {tx.quantity}
                    </td>
                    <td className="px-4 py-3 text-right text-[#727680]">
                      {formatCurrency(tx.price, currency)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-[#202329]">
                      {formatCurrency(amount, currency)}
                    </td>
                    {hasActions && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          {onUpdate && (
                            <button
                              type="button"
                              onClick={() => openEdit(tx)}
                              className="rounded-lg p-2 text-[#727680] transition-colors hover:bg-[#f3f4f6] hover:text-[#202329]"
                              aria-label={`${tx.symbol} 거래 수정`}
                              title="수정"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          )}
                          {onRemove && (
                            <button
                              type="button"
                              onClick={() => openDelete(tx)}
                              className="rounded-lg p-2 text-[#727680] transition-colors hover:bg-[#fceeee]/10 hover:text-[#d65353]"
                              aria-label={`${tx.symbol} 거래 삭제`}
                              title="삭제"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editing && editDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-transaction-title"
            onSubmit={submitEdit}
            className="w-full max-w-lg rounded-2xl border border-[#e6e8eb] bg-[#ffffff] p-5 shadow-2xl"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3
                  id="edit-transaction-title"
                  className="text-lg font-semibold text-[#202329]"
                >
                  거래 수정
                </h3>
                <p className="mt-1 text-sm text-[#727680]">
                  {editing.symbol} · {editing.name}
                </p>
              </div>
              <button
                type="button"
                onClick={closeEdit}
                disabled={busy}
                className="rounded-lg p-2 text-[#727680] hover:bg-[#ffffff] hover:text-[#202329] disabled:opacity-50"
                aria-label="수정 창 닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm text-[#727680]">
                  구분
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(["buy", "sell"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() =>
                        setEditDraft((prev) => prev && { ...prev, type })
                      }
                      className={cn(
                        "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                        editDraft.type === type
                          ? type === "buy"
                            ? "border-[#9b9fa7] bg-[#f3f4f6] text-[#727680]"
                            : "border-[#edc4c4] bg-[#fceeee]/10 text-[#d65353]"
                          : "border-[#e6e8eb] text-[#727680] hover:bg-[#ffffff]",
                      )}
                    >
                      {type === "buy" ? "매수" : "매도"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor="edit-transaction-date"
                  className="mb-2 block text-sm text-[#727680]"
                >
                  거래일
                </label>
                <input
                  id="edit-transaction-date"
                  type="date"
                  max={todayISO()}
                  value={editDraft.date}
                  onChange={(e) =>
                    setEditDraft(
                      (prev) => prev && { ...prev, date: e.target.value },
                    )
                  }
                  required
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-[#727680]">
                  거래일을 바꾸면 그 날짜의 환율도 다시 계산합니다.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label
                    htmlFor="edit-transaction-quantity"
                    className="mb-2 block text-sm text-[#727680]"
                  >
                    수량
                  </label>
                  <input
                    id="edit-transaction-quantity"
                    type="number"
                    min="0"
                    step="any"
                    value={editDraft.quantity}
                    onChange={(e) =>
                      setEditDraft(
                        (prev) => prev && { ...prev, quantity: e.target.value },
                      )
                    }
                    required
                    className={inputClass}
                  />
                </div>
                <div>
                  <label
                    htmlFor="edit-transaction-price"
                    className="mb-2 block text-sm text-[#727680]"
                  >
                    단가
                  </label>
                  <input
                    id="edit-transaction-price"
                    type="number"
                    min="0"
                    step="any"
                    value={editDraft.price}
                    onChange={(e) =>
                      setEditDraft(
                        (prev) => prev && { ...prev, price: e.target.value },
                      )
                    }
                    required
                    className={inputClass}
                  />
                </div>
                <div>
                  <label
                    htmlFor="edit-transaction-fee"
                    className="mb-2 block text-sm text-[#727680]"
                  >
                    수수료
                  </label>
                  <input
                    id="edit-transaction-fee"
                    type="number"
                    min="0"
                    step="any"
                    value={editDraft.fee}
                    onChange={(e) =>
                      setEditDraft(
                        (prev) => prev && { ...prev, fee: e.target.value },
                      )
                    }
                    className={inputClass}
                  />
                </div>
              </div>

              <p className="text-xs text-[#727680]">
                종목 자체를 잘못 선택한 경우에는 이 거래를 삭제하고 새 거래를
                추가하는 편이 안전합니다.
              </p>

              {error && (
                <div className="rounded-lg border border-[#edc4c4]/30 bg-[#fceeee]/10 px-3 py-2 text-sm text-[#d65353]">
                  {error}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeEdit}
                disabled={busy}
                className="rounded-lg border border-[#e6e8eb] px-4 py-2 text-sm text-[#727680] hover:bg-[#ffffff] disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={busy}
                className="flex items-center gap-2 rounded-lg bg-[#25282e] px-4 py-2 text-sm font-semibold text-[#ffffff] hover:bg-[#25282e] disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                저장
              </button>
            </div>
          </form>
        </div>
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-transaction-title"
            className="w-full max-w-md rounded-2xl border border-[#e6e8eb] bg-[#ffffff] p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3
                  id="delete-transaction-title"
                  className="text-lg font-semibold text-[#202329]"
                >
                  거래를 삭제할까요?
                </h3>
                <p className="mt-2 text-sm leading-6 text-[#727680]">
                  {formatDate(deleting.date)} · {deleting.symbol} ·{" "}
                  {deleting.type === "buy" ? "매수" : "매도"}{" "}
                  {deleting.quantity}주
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (busy) return;
                  setDeleting(null);
                  setError(null);
                }}
                disabled={busy}
                className="rounded-lg p-2 text-[#727680] hover:bg-[#ffffff] hover:text-[#202329] disabled:opacity-50"
                aria-label="삭제 확인 창 닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-4 text-sm text-[#727680]">
              삭제하면 포트폴리오의 수량, 평균단가, 손익이 즉시 다시 계산됩니다.
            </p>

            {error && (
              <div className="mt-4 rounded-lg border border-[#edc4c4]/30 bg-[#fceeee]/10 px-3 py-2 text-sm text-[#d65353]">
                {error}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (busy) return;
                  setDeleting(null);
                  setError(null);
                }}
                disabled={busy}
                className="rounded-lg border border-[#e6e8eb] px-4 py-2 text-sm text-[#727680] hover:bg-[#ffffff] disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={busy}
                className="flex items-center gap-2 rounded-lg bg-[#f7e9e9] px-4 py-2 text-sm font-semibold text-[#a73d3d] hover:bg-[#f3dede] disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
