"use client";
import { useTradeMarket } from "@/features/market/use-trade-market";
import { useAuth } from "@/hooks/useAuth";
import { useTransactionCommands, useTransactions } from "@/hooks/usePortfolio";
import { todayISO } from "@/lib/format";
import { discoveryStocks } from "@/lib/markets";
import { getAvailableQuantity } from "@/lib/portfolio";
import type { StockSearchResult, TransactionType } from "@/lib/types";
import { useOperationScope } from "@/shared/react/use-operation-scope";
import { useRef, useState, type FormEvent } from "react";

/** Owns one account-keyed form's draft and save lifecycle; storage remains in the ledger. */
export function useTransactionEntry(initialSymbol: string) {
  const { transactions } = useTransactions();
  const { user } = useAuth();
  const captureScope = useOperationScope(user?.id ?? "guest");
  const { addTransaction } = useTransactionCommands();
  const [selected, setSelected] = useState<StockSearchResult | null>(
    () => discoveryStocks("all").find((stock) => stock.symbol === initialSymbol) ?? null,
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
  const { market, marketLoading, marketError } = useTradeMarket(selected?.symbol, effectiveDate, retry);
  const submitting = useRef(false);
  const [saving, setSaving] = useState(false);

  const validMarket = market?.symbol === selected?.symbol && market?.date === effectiveDate ? market : null;
  const availableQty = selected ? getAvailableQuantity(transactions, selected.symbol) : 0;

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
    if (!selected || !validMarket || marketLoading || submitting.current) return;
    const qty = Number(quantity);
    const unitPrice = Number(price);
    const feeAmount = Number(fee || 0);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unitPrice) || unitPrice <= 0) {
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

  return {
    user, selected, txType, setTxType, date, setDate, recordDate, setRecordDate,
    price, setPrice, quantity, setQuantity, fee, setFee, error, setError,
    success, setSuccess, setRetry, marketLoading, marketError, validMarket,
    availableQty, saving, chooseStock, handleSubmit,
    totalAmount: (Number(quantity) || 0) * (Number(price) || 0),
  };
}
