"use client";
import { TradeStockPicker } from "@/features/portfolio/ui/TradeStockPicker";
import { useAuth } from "@/hooks/useAuth";
import { useOperationScope } from "@/shared/react/use-operation-scope";

import { useTradeMarket } from "@/features/market/use-trade-market";
import { useTransactionCommands, useTransactions } from "@/hooks/usePortfolio";
import { formatCurrency, todayISO } from "@/lib/format";
import { discoveryStocks } from "@/lib/markets";
import { getAvailableQuantity } from "@/lib/portfolio";
import type { StockSearchResult, TransactionType } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Loader2,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";

const inputClass =
  "w-full rounded-xl border border-[#e6e8eb] bg-[#ffffff] px-4 py-3 text-sm text-[#202329] outline-none transition focus:border-[#9b9fa7] focus:ring-2 focus:ring-[#25282e]/10";

export function TransactionForm(props: { initialSymbol?: string }) {
  const { user } = useAuth();
  return <TransactionFormSession key={user?.id ?? "guest"} {...props} />;
}
function TransactionFormSession({
  initialSymbol = "",
}: {
  initialSymbol?: string;
}) {
  const { transactions } = useTransactions();
  const { user } = useAuth();
  const captureScope = useOperationScope(user?.id ?? "guest");
  const { addTransaction } = useTransactionCommands();
  const [selected, setSelected] = useState<StockSearchResult | null>(
    () =>
      discoveryStocks("all").find((stock) => stock.symbol === initialSymbol) ??
      null,
  );
  const [txType, setTxType] = useState<TransactionType>("buy");
  const [date, setDate] = useState("");
  const [recordDate, setRecordDate] = useState(false);
  const effectiveDate = recordDate && date ? date : todayISO();
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [fee, setFee] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [retry, setRetry] = useState(0);
  const { market, marketLoading, marketError } = useTradeMarket(
    selected?.symbol,
    effectiveDate,
    retry,
  );
  const submitting = useRef(false);
  const [saving, setSaving] = useState(false);

  const validMarket =
    market?.symbol === selected?.symbol && market?.date === effectiveDate
      ? market
      : null;
  const availableQty = selected
    ? getAvailableQuantity(transactions, selected.symbol)
    : 0;

  const chooseStock = (stock: StockSearchResult) => {
    if (submitting.current) return;
    setSelected(stock);
    setError(null);
    setSuccess(false);
    if (selected?.symbol !== stock.symbol) setPrice("");
    setQuantity("");
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !validMarket || marketLoading || submitting.current)
      return;
    const qty = Number(quantity);
    const unitPrice = Number(price);
    const feeAmount = Number(fee || 0);
    if (
      !Number.isFinite(qty) ||
      qty <= 0 ||
      !Number.isFinite(unitPrice) ||
      unitPrice <= 0
    ) {
      setError("수량과 체결 단가는 0보다 큰 숫자로 입력해 주세요.");
      return;
    }
    if (!Number.isFinite(feeAmount) || feeAmount < 0) {
      setError("수수료는 0 이상의 숫자로 입력해 주세요.");
      return;
    }
    const isCurrent = captureScope();
    submitting.current = true;
    setSaving(true);
    const transactionError = await addTransaction({
      symbol: selected.symbol,
      name: selected.name,
      type: txType,
      date: effectiveDate,
      quantity: qty,
      price: unitPrice,
      fee: feeAmount,
      currency: validMarket.quote.currency,
      fxRateToKRW: validMarket.fx,
      usdKrwRateAtTransaction: validMarket.usdKrw,
    });
    submitting.current = false;
    if (!isCurrent()) return;
    setSaving(false);
    if (transactionError) {
      setError(transactionError);
      return;
    }
    setError(null);
    setSuccess(true);
    setQuantity("");
    setFee("");
  };

  const totalAmount = (Number(quantity) || 0) * (Number(price) || 0);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.05fr_1fr]">
      <TradeStockPicker
        selected={selected}
        chooseStock={chooseStock}
        initialSymbol={initialSymbol}
      />

      <section className="rounded-2xl border border-[#e6e8eb] bg-[#ffffff] p-6 sm:p-7">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f3f4f6] text-xs font-semibold text-[#727680]">
            02
          </span>
          <h2 className="text-base font-semibold text-[#202329]">
            거래 입력
          </h2>
        </div>
        {selected ? (
          <form onSubmit={handleSubmit} className="space-y-5">
            <fieldset disabled={saving} className="contents">
              <div className="flex items-center justify-between gap-3 rounded-xl bg-[#ffffff] p-4">
                <div>
                  <p className="font-semibold text-[#202329]">
                    {selected.name}
                  </p>
                  <p className="mt-1 text-xs text-[#727680]">
                    {selected.symbol} · 보유{" "}
                    {availableQty.toLocaleString("ko-KR")}주
                  </p>
                </div>
                <Link
                  href={`/stock/${encodeURIComponent(selected.symbol)}`}
                  className="flex items-center gap-1 text-xs font-medium text-[#727680]"
                >
                  종목 보기
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#f3f4f6] p-1">
                {(["buy", "sell"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={txType === type}
                    onClick={() => {
                      setTxType(type);
                      setError(null);
                      setSuccess(false);
                    }}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition",
                      txType === type
                        ? "bg-[#e9ecf0] text-[#25282e] shadow-sm ring-1 ring-inset ring-[#9b9fa7]"
                        : "text-[#727680] hover:text-[#202329]",
                    )}
                  >
                    {type === "buy" ? (
                      <ArrowDownLeft className="h-4 w-4" />
                    ) : (
                      <ArrowUpRight className="h-4 w-4" />
                    )}
                    {type === "buy" ? "매수했어요" : "매도했어요"}
                  </button>
                ))}
              </div>
              <div>
                <label
                  htmlFor="transaction-price"
                  className="mb-2 block text-xs font-medium text-[#727680]"
                >
                  {txType === "buy" ? "매수 단가" : "매도 단가"}
                  {validMarket ? ` (${validMarket.quote.currency})` : ""}
                </label>
                <input
                  id="transaction-price"
                  type="number"
                  min="0.000001"
                  step="any"
                  required
                  value={price}
                  onChange={(event) => {
                    setPrice(event.target.value);
                    setSuccess(false);
                  }}
                  placeholder="실제 거래한 1주 가격"
                  className={inputClass}
                />

              </div>
              {marketLoading && (
                <div className="flex items-center text-xs text-[#727680]">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  거래 통화와 환율을 확인하고 있어요
                </div>
              )}
              {marketError && (
                <div
                  role="alert"
                  className="rounded-xl bg-[#f3f4f6] p-4 text-[13px] leading-6 text-[#d65353]"
                >
                  <p>{marketError}</p>
                  <button
                    type="button"
                    onClick={() => setRetry((value) => value + 1)}
                    className="mt-1 font-semibold underline underline-offset-4"
                  >
                    다시 불러오기
                  </button>
                </div>
              )}
              {validMarket && !marketLoading && (
                <p className="text-xs text-[#727680]">
                  거래 통화 {validMarket.quote.currency}{" "}
                  <span className="mx-2">·</span> 적용 환율 $1 ={" "}
                  {formatCurrency(validMarket.usdKrw, "KRW")}
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="transaction-quantity"
                    className="mb-2 block text-xs font-medium text-[#727680]"
                  >
                    수량
                  </label>
                  <input
                    id="transaction-quantity"
                    type="number"
                    min="0.0001"
                    step="any"
                    value={quantity}
                    onChange={(event) => {
                      setQuantity(event.target.value);
                      setSuccess(false);
                    }}
                    required
                    className={inputClass}
                    placeholder="0주"
                  />
                </div>
                <div>
                  <label
                    htmlFor="transaction-fee"
                    className="mb-2 block text-xs font-medium text-[#727680]"
                  >
                    수수료{" "}
                    <span className="font-normal text-[#727680]">(선택)</span>
                  </label>
                  <input
                    id="transaction-fee"
                    type="number"
                    min="0"
                    step="any"
                    value={fee}
                    onChange={(event) => setFee(event.target.value)}
                    className={inputClass}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="rounded-xl bg-[#f7f8fa] p-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-[#202329]">
                  <input
                    type="checkbox"
                    checked={recordDate}
                    aria-controls="optional-transaction-date"
                    onChange={(event) => {
                      setRecordDate(event.target.checked);
                      setSuccess(false);
                    }}
                    className="h-4 w-4 accent-[#25282e]"
                  />
                  {txType === "buy" ? "매수일 직접 기록" : "매도일 직접 기록"}
                  <span className="text-xs text-[#727680]">(선택)</span>
                </label>
                {recordDate && (
                  <div id="optional-transaction-date" className="mt-3">
                    <label
                      htmlFor="transaction-date"
                      className="mb-2 block text-xs font-medium text-[#727680]"
                    >
                      {txType === "buy" ? "매수일" : "매도일"}
                    </label>
                    <input
                      id="transaction-date"
                      type="date"
                      value={date}
                      max={todayISO()}
                      onChange={(event) => {
                        setDate(event.target.value);
                        setSuccess(false);
                      }}
                      className={inputClass}
                    />
                  </div>
                )}
                <p className="mt-2 text-xs leading-5 text-[#727680]">
                  날짜 미입력 시 오늘(KST)
                </p>
              </div>
              {totalAmount > 0 && validMarket && (
                <div className="flex items-center justify-between border-t border-[#e6e8eb] pt-4 text-sm">
                  <span className="text-[#727680]">
                    {txType === "buy" ? "총 매수 금액" : "총 매도 금액"}{" "}
                    <span className="text-xs">(수수료 반영)</span>
                  </span>
                  <span className="font-semibold text-[#202329]">
                    {formatCurrency(
                      totalAmount +
                        (txType === "buy" ? 1 : -1) * (Number(fee) || 0),
                      validMarket.quote.currency,
                    )}
                  </span>
                </div>
              )}
              {error && (
                <p
                  role="alert"
                  className="rounded-xl bg-[#f3f4f6] px-4 py-3 text-sm text-[#d65353]"
                >
                  {error}
                </p>
              )}
              {success && (
                <div
                  role="status"
                  className="flex items-center justify-between gap-2 rounded-xl bg-[#f3f4f6] px-4 py-3 text-xs text-[#727680]"
                >
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    거래를 기록했어요.
                  </span>
                  <Link
                    href="/portfolio"
                    className="font-semibold underline underline-offset-4"
                  >
                    포트폴리오 보기
                  </Link>
                </div>
              )}
              <button
                type="submit"
                disabled={saving || !validMarket || marketLoading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25282e] py-3.5 text-sm font-medium text-[#ffffff] transition hover:bg-[#25282e] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
                {txType === "buy" ? "매수 기록 저장" : "매도 기록 저장"}
              </button>

            </fieldset>
          </form>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">

            <h3 className="text-base font-semibold text-[#202329]">
              종목을 선택하세요
            </h3>

          </div>
        )}
      </section>
    </div>
  );
}
