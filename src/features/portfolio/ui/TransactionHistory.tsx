"use client";
import { AssetAvatar } from "@/components/AssetAvatar";
import { TransactionList } from "@/components/TransactionList";
import { useAuth } from "@/hooks/useAuth";
import { useTransactionCommands, useTransactions } from "@/hooks/usePortfolio";
import { useWorkspace } from "@/hooks/useWorkspace";
import { DEMO_TRANSACTIONS } from "@/lib/demo";
import { formatCurrency } from "@/lib/format";
import type { Transaction } from "@/lib/types";
import { Loader2, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";

export function TransactionHistory() {
  const { user } = useAuth();
  const { isDemo } = useWorkspace();
  return <History key={(user?.id ?? "local") + ":" + isDemo} isDemo={isDemo} />;
}
function History({ isDemo }: { isDemo: boolean }) {
  const { transactions } = useTransactions();
  const { updateTransaction, removeTransaction, restoreTransaction } = useTransactionCommands();
  const [lastDeleted, setLastDeleted] = useState<Transaction | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);
  useEffect(() => {
    if (!lastDeleted) return;
    const timeout = window.setTimeout(() => {
      setLastDeleted(null);
      setUndoError(null);
    }, 8000);
    return () => window.clearTimeout(timeout);
  }, [lastDeleted]);
  const handleUndo = async () => {
    if (!lastDeleted) return;
    setUndoing(true);
    setUndoError(null);
    try {
      const error = await restoreTransaction(lastDeleted);
      if (error) setUndoError(error);
      else setLastDeleted(null);
    } catch {
      setUndoError("거래를 복구하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setUndoing(false);
    }
  };
  return <>
      {isDemo ? (
        <section className="surface">
          <div className="surface-header">
            <h2>샘플 거래 기록</h2>
            <p>실제 거래 기록과 분리된 예시입니다.</p>
          </div>
          <div className="sample-transactions">
            {DEMO_TRANSACTIONS.map((tx) => (
              <div className="sample-transaction" key={tx.id}>
                <AssetAvatar symbol={tx.symbol} />
                <div>
                  <strong>
                    {tx.name} <span className="buy-chip">매수</span>
                  </strong>
                  <small>
                    {tx.date} · {tx.quantity}주
                  </small>
                </div>
                <div>
                  <strong>
                    {formatCurrency(tx.price * tx.quantity, tx.currency)}
                  </strong>
                  <small>주당 {formatCurrency(tx.price, tx.currency)}</small>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <TransactionList
          transactions={transactions}
          onUpdate={updateTransaction}
          onRemove={removeTransaction}
          onDeleted={(transaction) => {
            setUndoError(null);
            setLastDeleted(transaction);
          }}
        />
      )}
      {lastDeleted && (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 z-40 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 rounded-cf-card border border-cf-line bg-cf-surface px-4 py-3 shadow-cf-dialog md:bottom-6"
        >
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-cf-label font-medium">
                {lastDeleted.symbol} 거래를 삭제했습니다.
              </p>
              <p className="mt-1 text-cf-caption text-cf-muted">
                {undoError ?? "8초 안에 되돌릴 수 있습니다."}
              </p>
            </div>
            <button
              onClick={handleUndo}
              disabled={undoing}
              className="button-secondary"
            >
              {undoing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RotateCcw size={14} />
              )}
              되돌리기
            </button>
            <button onClick={() => setLastDeleted(null)} aria-label="알림 닫기">
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </>;
}
