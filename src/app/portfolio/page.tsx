"use client";
import { AssetAvatar } from "@/components/AssetAvatar";
import {
AddTransactionLink,
PageHeading,
PortfolioMode,
} from "@/components/Header";
import { HoldingsTable } from "@/components/HoldingsTable";
import { PortfolioMetrics } from "@/components/PortfolioMetrics";
import { WealthChart } from "@/components/WealthChart";
import { AllocationChart } from "@/components/AllocationChart";
import { TransactionList } from "@/components/TransactionList";
import { usePortfolioMarket,usePreferences,useTransactionCommands,useTransactions } from "@/hooks/usePortfolio";
import { useWorkspaceSummary } from "@/hooks/useWorkspace";
import { DEMO_TRANSACTIONS } from "@/lib/demo";
import { formatCurrency } from "@/lib/format";
import type { Transaction } from "@/lib/types";
import { Download,Loader2,RotateCcw,X } from "lucide-react";
import { useEffect,useState } from "react";
export default function PortfolioPage() {
  const { summary, isDemo } = useWorkspaceSummary();
  const { transactions } = useTransactions();
  const { updateTransaction, removeTransaction, restoreTransaction } = useTransactionCommands();
  const { displayCurrency } = usePreferences();
  const { loading, marketDataError } = usePortfolioMarket();
  const [tab, setTab] = useState("holdings");
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
  const exportHoldings = () => {
    const rows = [
      [isDemo ? "샘플 데이터" : "내 보유 자산", "표시 통화", displayCurrency],
      ["종목", "이름", "수량", "평가액", "평가손익", "수익률(%)"],
      ...(summary?.holdings ?? []).map((h) => [
        h.symbol,
        h.name,
        h.quantity,
        h.quote ? h.displayMarketValue : "시세 미확인",
        h.quote ? h.displayGainLoss : "시세 미확인",
        h.quote ? h.displayGainLossPercent : "시세 미확인",
      ]),
    ];
    const csv = rows
      .map((row) =>
        row
          .map((cell) => {
            const value = String(cell);
            const safe =
              typeof cell === "string" && /^[=+@-]/.test(value)
                ? `'${value}`
                : value;
            return `"${safe.replaceAll('"', '""')}"`;
          })
          .join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `centifolio-${isDemo ? "sample" : "holdings"}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  return (
    <>
      <PageHeading title="내 포트폴리오">
        <AddTransactionLink />
      </PageHeading>
      <PortfolioMode />
      {!isDemo && marketDataError && (
        <p
          role="status"
          className="mb-4 rounded-cf-control bg-cf-warning-soft p-3 text-cf-caption text-cf-muted"
        >
          {marketDataError}
        </p>
      )}
      <PortfolioMetrics />
      <details className="mb-6" open><summary className="mb-4 cursor-pointer text-cf-label font-semibold text-cf-muted">자산 흐름과 배분</summary><div className="dashboard-main-grid"><WealthChart/><AllocationChart holdings={summary?.holdings ?? []} displayCurrency={displayCurrency}/></div></details>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="section-tabs" role="group" aria-label="포트폴리오 보기">
          <button
            aria-pressed={tab === "holdings"}
            onClick={() => setTab("holdings")}
            className={tab === "holdings" ? "selected" : ""}
          >
            보유 자산<span>{summary?.holdings.length ?? 0}</span>
          </button>
          <button
            aria-pressed={tab === "transactions"}
            onClick={() => setTab("transactions")}
            className={tab === "transactions" ? "selected" : ""}
          >
            거래 내역
            <span>
              {isDemo ? DEMO_TRANSACTIONS.length : transactions.length}
            </span>
          </button>
        </div>
        {(summary?.holdings.length ?? 0) > 0 && (
          <button className="button-secondary" onClick={exportHoldings}>
            <Download size={13} />
            보유 자산 CSV
          </button>
        )}
      </div>
      {tab === "holdings" ? (
        <HoldingsTable
          holdings={summary?.holdings ?? []}
          displayCurrency={displayCurrency}
          loading={!isDemo && loading}
          editable={!isDemo}
        />
      ) : isDemo ? (
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
          className="fixed bottom-24 left-1/2 z-40 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 rounded-xl border border-[#e6e8eb] bg-[#ffffff] px-4 py-3 shadow-xl md:bottom-6"
        >
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
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
    </>
  );
}
