"use client";
import { todayISO } from "@/lib/format";
import type { Transaction } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Loader2, X } from "lucide-react";
import { FormEvent } from "react";
interface EditDraft {
  type: Transaction["type"];
  date: string;
  quantity: string;
  price: string;
  fee: string;
}

const inputClass =
  "w-full rounded-lg border border-[#e6e8eb] bg-[#ffffff] px-3 py-2 text-sm text-[#202329] outline-none focus:border-[#9b9fa7]";
export function TransactionEditor({
  editing,
  editDraft,
  setEditDraft,
  submitEdit,
  closeEdit,
  busy,
  error,
}: {
  editing: Transaction;
  editDraft: EditDraft;
  setEditDraft: React.Dispatch<React.SetStateAction<EditDraft | null>>;
  submitEdit: (event: FormEvent) => void;
  closeEdit: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-transaction-title"
        onSubmit={submitEdit}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#e6e8eb] bg-[#ffffff] p-5 shadow-2xl"
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
            <label className="mb-2 block text-sm text-[#727680]">구분</label>
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
              {editDraft.type === "buy" ? "매수일" : "매도일"} (선택)
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
              className={inputClass}
            />
            <p className="mt-1 text-xs text-[#727680]">
              날짜 미입력 시 오늘(한국시간) · 날짜 변경 시 환율 재계산
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
            종목 변경은 거래 삭제 후 다시 추가
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
  );
}
