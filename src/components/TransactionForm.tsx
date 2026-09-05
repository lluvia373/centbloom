"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  CircleHelp,
  Loader2,
  Plus,
  Search,
  X,
} from "lucide-react";
import {
  searchStocks,
  getHistoricalDay,
  getFxRateToKRW,
} from "@/lib/stock-api";
import { formatCurrency, todayISO } from "@/lib/format";
import type { DayOHLC, StockSearchResult, TransactionType } from "@/lib/types";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useWorkspace } from "@/hooks/useWorkspace";
import { getAvailableQuantity } from "@/lib/portfolio";
import { PriceRangePicker } from "@/components/PriceRangePicker";
import { cn } from "@/lib/utils";

const popularStocks: StockSearchResult[] = [
  { symbol: "AAPL", name: "Apple", exchange: "NASDAQ", type: "EQUITY" },
  { symbol: "NVDA", name: "NVIDIA", exchange: "NASDAQ", type: "EQUITY" },
  { symbol: "MSFT", name: "Microsoft", exchange: "NASDAQ", type: "EQUITY" },
  { symbol: "GOOGL", name: "Alphabet", exchange: "NASDAQ", type: "EQUITY" },
  { symbol: "005930.KS", name: "삼성전자", exchange: "KOSPI", type: "EQUITY" },
  {
    symbol: "VOO",
    name: "Vanguard S&P 500 ETF",
    exchange: "NYSE Arca",
    type: "ETF",
  },
];
const inputClass =
  "w-full rounded-xl border border-[#e6e8eb] bg-[#ffffff] px-4 py-3 text-sm text-[#202329] outline-none transition focus:border-[#9b9fa7] focus:ring-2 focus:ring-[#25282e]/10";

export function TransactionForm({
  initialSymbol = "",
}: {
  initialSymbol?: string;
}) {
  const { transactions, addTransaction } = usePortfolio();
  const { setDemo } = useWorkspace();
  const [query, setQuery] = useState(initialSymbol);
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(Boolean(initialSymbol));
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<StockSearchResult | null>(
    () => popularStocks.find((stock) => stock.symbol === initialSymbol) ?? null,
  );
  const [txType, setTxType] = useState<TransactionType>("buy");
  const [date, setDate] = useState(todayISO());
  const [market, setMarket] = useState<{
    symbol: string;
    date: string;
    ohlc: DayOHLC;
    fx: number;
    usdKrw: number;
  } | null>(null);
  const [ohlcError, setOhlcError] = useState<string | null>(null);
  const [ohlcLoading, setOhlcLoading] = useState(false);
  const [price, setPrice] = useState(0);
  const [quantity, setQuantity] = useState("");
  const [fee, setFee] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [retry, setRetry] = useState(0);

  const validMarket =
    market?.symbol === selected?.symbol && market?.date === date
      ? market
      : null;
  const ohlc = validMarket?.ohlc;
  const availableQty = selected
    ? getAvailableQuantity(transactions, selected.symbol)
    : 0;

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (!query.trim()) {
        setResults([]);
        setSearchLoading(false);
        setSearchError(null);
        return;
      }
      setSearchLoading(true);
      setSearchError(null);
      try {
        const stocks = await searchStocks(query.trim());
        if (cancelled) return;
        setResults(stocks);
        if (query === initialSymbol) {
          const exact = stocks.find(
            (stock) =>
              stock.symbol.toUpperCase() === initialSymbol.toUpperCase(),
          );
          if (exact) setSelected((current) => current ?? exact);
        }
      } catch {
        if (cancelled) return;
        setResults([]);
        setSearchError("검색을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, initialSymbol, retry]);

  useEffect(() => {
    if (!selected || !date) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setOhlcLoading(true);
      setOhlcError(null);
      try {
        const data = await getHistoricalDay(selected.symbol, date);
        const [fx, usdKrw] = await Promise.all([
          getFxRateToKRW(data.currency, date),
          getFxRateToKRW("USD", date),
        ]);
        if (cancelled) return;
        setMarket({ symbol: selected.symbol, date, ohlc: data, fx, usdKrw });
        setPrice(Math.round(data.close * 100) / 100);
      } catch (err) {
        if (cancelled) return;
        setMarket(null);
        setOhlcError(
          err instanceof Error
            ? err.message
            : "거래일 시세 또는 환율을 불러올 수 없습니다.",
        );
      } finally {
        if (!cancelled) setOhlcLoading(false);
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [selected, date, retry]);

  const chooseStock = (stock: StockSearchResult) => {
    setSelected(stock);
    setError(null);
    setSuccess(false);
    setOhlcError(null);
    setQuantity("");
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !validMarket || ohlcLoading) return;
    const qty = Number(quantity);
    const feeAmount = Number(fee || 0);
    if (
      !Number.isFinite(qty) ||
      qty <= 0 ||
      !Number.isFinite(price) ||
      price <= 0
    ) {
      setError("수량과 체결 단가는 0보다 큰 숫자로 입력해 주세요.");
      return;
    }
    if (!Number.isFinite(feeAmount) || feeAmount < 0) {
      setError("수수료는 0 이상의 숫자로 입력해 주세요.");
      return;
    }
    const transactionError = addTransaction({
      symbol: selected.symbol,
      name: selected.name,
      type: txType,
      date,
      quantity: qty,
      price,
      fee: feeAmount,
      currency: validMarket.ohlc.currency,
      fxRateToKRW: validMarket.fx,
      usdKrwRateAtTransaction: validMarket.usdKrw,
    });
    if (transactionError) {
      setError(transactionError);
      return;
    }
    setDemo(false);
    setError(null);
    setSuccess(true);
    setQuantity("");
    setFee("");
  };

  const totalAmount = (Number(quantity) || 0) * price;
  const stocksToShow = query.trim() ? results : popularStocks;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.05fr_1fr]">
      <section className="overflow-hidden rounded-2xl border border-[#e6e8eb] bg-[#ffffff]">
        <div className="border-b border-[#e6e8eb] p-6 sm:p-7">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f3f4f6] text-xs font-semibold text-[#727680]">
              01
            </span>
            <h2 className="text-base font-semibold text-[#202329]">
              어떤 종목을 거래했나요?
            </h2>
          </div>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#727680]" />
            <input
              aria-label="종목 검색"
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSearchLoading(Boolean(event.target.value.trim()));
              }}
              placeholder="기업명 또는 티커로 검색"
              className={cn(inputClass, "bg-[#ffffff] py-3.5 pl-11 pr-10")}
            />
            {query && (
              <button
                type="button"
                aria-label="검색어 지우기"
                onClick={() => {
                  setQuery("");
                  setSearchLoading(false);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-[#727680] hover:bg-[#f3f4f6]"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="mt-3 text-xs text-[#727680]">
            미국 · 한국 주식과 ETF를 검색할 수 있어요.
          </p>
        </div>
        <div className="p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between px-2">
            <h3 className="text-xs font-medium text-[#727680]">
              {query.trim() ? "검색 결과" : "빠르게 찾아보기"}
            </h3>
            <span className="text-xs uppercase tracking-wider text-[#727680]">
              STOCKS & ETFS
            </span>
          </div>
          <div aria-live="polite" className="min-h-56">
            {searchLoading ? (
              <div className="flex items-center justify-center py-20 text-sm text-[#727680]">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                종목을 찾고 있어요
              </div>
            ) : searchError ? (
              <div className="p-8 text-center">
                <p className="text-sm leading-6 text-[#727680]">
                  {searchError}
                </p>
                <button
                  type="button"
                  onClick={() => setRetry((value) => value + 1)}
                  className="mt-4 text-sm font-medium text-[#727680]"
                >
                  다시 검색하기
                </button>
              </div>
            ) : stocksToShow.length === 0 ? (
              <div className="py-16 text-center">
                <Search className="mx-auto mb-3 h-7 w-7 text-[#727680]" />
                <p className="text-sm text-[#727680]">
                  검색 결과가 없어요. 다른 기업명이나 티커를 입력해 보세요.
                </p>
              </div>
            ) : (
              stocksToShow.map((stock, index) => (
                <button
                  key={stock.symbol}
                  type="button"
                  onClick={() => chooseStock(stock)}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors",
                    selected?.symbol === stock.symbol
                      ? "bg-[#f3f4f6]"
                      : "hover:bg-[#ffffff]",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold",
                      [
                        "bg-[#f3f4f6] text-[#202329]",
                        "bg-[#f3f4f6] text-[#727680]",
                        "bg-[#f3f4f6] text-[#727680]",
                        "bg-[#f3f4f6] text-[#d65353]",
                      ][index % 4],
                    )}
                  >
                    {stock.symbol === "005930.KS"
                      ? "삼"
                      : stock.symbol.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[#202329]">
                      {stock.name}
                    </span>
                    <span className="mt-1 block text-xs text-[#727680]">
                      {stock.symbol}{" "}
                      <span className="mx-1.5 text-[#727680]">·</span>{" "}
                      {stock.exchange}
                    </span>
                  </span>
                  {selected?.symbol === stock.symbol ? (
                    <Check className="h-4 w-4 text-[#727680]" />
                  ) : (
                    <ArrowRight className="h-4 w-4 text-[#727680] group-hover:text-[#727680]" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
        <div className="flex items-start gap-2 border-t border-[#e6e8eb] bg-[#ffffff] px-6 py-4 text-xs leading-5 text-[#727680]">
          <CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          거래 기록용 앱입니다. 실제 주식 주문은 증권사에서 진행해 주세요.
        </div>
      </section>

      <section className="rounded-2xl border border-[#e6e8eb] bg-[#ffffff] p-6 sm:p-7">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f3f4f6] text-xs font-semibold text-[#727680]">
            02
          </span>
          <h2 className="text-base font-semibold text-[#202329]">
            거래를 기록해 볼까요
          </h2>
        </div>
        {selected ? (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="flex items-center justify-between gap-3 rounded-xl bg-[#ffffff] p-4">
              <div>
                <p className="font-semibold text-[#202329]">{selected.name}</p>
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
                <ArrowUpRight className="h-3.5 w-3.5" />
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
                htmlFor="transaction-date"
                className="mb-2 block text-xs font-medium text-[#727680]"
              >
                거래일
              </label>
              <input
                id="transaction-date"
                type="date"
                value={date}
                max={todayISO()}
                onChange={(event) => {
                  setDate(event.target.value);
                  setOhlcError(null);
                  setSuccess(false);
                }}
                required
                className={inputClass}
              />
            </div>
            {ohlcLoading && (
              <div className="flex items-center justify-center rounded-xl bg-[#ffffff] py-8 text-xs text-[#727680]">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                거래일 시세와 환율을 확인하고 있어요
              </div>
            )}
            {ohlcError && (
              <div
                role="alert"
                className="rounded-xl bg-[#f3f4f6] p-4 text-[13px] leading-6 text-[#d65353]"
              >
                <p>{ohlcError}</p>
                <p>휴장일이라면 실제 거래가 있었던 날짜를 선택해 주세요.</p>
                <button
                  type="button"
                  onClick={() => setRetry((value) => value + 1)}
                  className="mt-1 font-semibold underline underline-offset-4"
                >
                  다시 불러오기
                </button>
              </div>
            )}
            {ohlc && !ohlcLoading && (
              <>
                <PriceRangePicker
                  ohlc={ohlc}
                  price={price}
                  onChange={setPrice}
                />
                <p className="text-xs text-[#727680]">
                  거래 통화 {ohlc.currency} <span className="mx-2">·</span>{" "}
                  거래일 환율 $1 = {formatCurrency(validMarket!.usdKrw, "KRW")}
                </p>
              </>
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
            {totalAmount > 0 && ohlc && (
              <div className="flex items-center justify-between border-t border-[#e6e8eb] pt-4 text-sm">
                <span className="text-[#727680]">
                  {txType === "buy" ? "총 매수 금액" : "총 매도 금액"}{" "}
                  <span className="text-xs">(수수료 반영)</span>
                </span>
                <span className="font-semibold text-[#202329]">
                  {formatCurrency(
                    totalAmount +
                      (txType === "buy" ? 1 : -1) * (Number(fee) || 0),
                    ohlc.currency,
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
              disabled={!validMarket || ohlcLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25282e] py-3.5 text-sm font-medium text-[#ffffff] transition hover:bg-[#25282e] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
              {txType === "buy" ? "매수 기록 저장" : "매도 기록 저장"}
            </button>
            <p className="text-center text-xs text-[#727680]">
              입력한 거래는 내 포트폴리오에 저장됩니다.
            </p>
          </form>
        ) : (
          <div className="flex min-h-[415px] flex-col items-center justify-center text-center">
            <div className="relative mb-6 flex h-20 w-20 items-center justify-center rounded-[24px] bg-[#f3f4f6]">
              <Plus className="h-8 w-8 text-[#727680]" />
              <span className="absolute -right-2 -top-2 h-5 w-5 rounded-full border-4 border-[#dde0e4] bg-[#f3f4f6]" />
            </div>
            <h3 className="text-base font-semibold text-[#202329]">
              나의 투자를 한 줄씩
            </h3>
            <p className="mt-3 max-w-56 text-sm leading-6 text-[#727680]">
              먼저 종목을 선택해 주세요.
              <br />
              거래일의 시세와 환율을 함께 불러올게요.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
