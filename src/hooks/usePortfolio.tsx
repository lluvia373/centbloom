"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  DisplayCurrency,
  Holding,
  HoldingWithQuote,
  PortfolioSummary,
  StockQuote,
  Transaction,
  TransactionType,
} from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import { deriveHoldings, validateTransactionHistory } from "@/lib/portfolio";
import { getFxRateToKRW, getQuote } from "@/lib/stock-api";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import {
  loadStoredTransactions,
  saveStoredTransactions,
  scopedKey,
  STORAGE_WRITE_ERROR,
  type StoredTransactionsResult,
} from "@/lib/portfolio-storage";
import {
  BASE_CURRENCY,
  DEFAULT_DISPLAY_CURRENCY,
  krwToDisplayCurrency,
  normalizeCurrency,
  toKRW,
} from "@/lib/currency";

const DISPLAY_CURRENCY_KEY = "stock-display-currency";
const MARKET_REFRESH_INTERVAL_MS = 30_000;

interface AddTransactionInput {
  symbol: string;
  name: string;
  type: TransactionType;
  date: string;
  quantity: number;
  price: number;
  fee?: number;
  currency: string;
  fxRateToKRW: number;
  usdKrwRateAtTransaction: number;
}

interface UpdateTransactionInput {
  type: TransactionType;
  date: string;
  quantity: number;
  price: number;
  fee?: number;
}

export type TransactionImportMode = "merge" | "replace";

export interface TransactionImportResult {
  error: string | null;
  importedCount: number;
  skippedCount: number;
}

interface PortfolioTransactionRow {
  id: string;
  user_id: string;
  symbol: string;
  name: string;
  transaction_type: TransactionType;
  trade_date: string;
  quantity: number;
  price: number;
  fee: number;
  currency: string | null;
  fx_rate_to_krw: number | null;
  usd_krw_rate_at_transaction: number | null;
  created_at: string;
}

interface PortfolioContextValue {
  transactions: Transaction[];
  holdings: Holding[];
  summary: PortfolioSummary | null;
  loading: boolean;
  displayCurrency: DisplayCurrency;
  lastMarketUpdateAt: number | null;
  marketDataError: string | null;
  storageError: string | null;
  setDisplayCurrency: (currency: DisplayCurrency) => void;
  addTransaction: (input: AddTransactionInput) => string | null;
  updateTransaction: (
    id: string,
    input: UpdateTransactionInput,
  ) => Promise<string | null>;
  removeTransaction: (id: string) => Promise<string | null>;
  restoreTransaction: (transaction: Transaction) => Promise<string | null>;
  importTransactions: (
    transactions: Transaction[],
    mode: TransactionImportMode,
  ) => Promise<TransactionImportResult>;
  refreshQuotes: () => Promise<void>;
}

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

function loadTransactions(userId?: string | null): StoredTransactionsResult {
  try {
    return loadStoredTransactions(window.localStorage, userId);
  } catch {
    return {
      transactions: [],
      error:
        "브라우저 저장소에 접근할 수 없습니다. 사이트 저장 권한을 허용한 뒤 새로고침해 주세요.",
    };
  }
}

function saveTransactions(
  transactions: Transaction[],
  userId?: string | null,
): string | null {
  try {
    return saveStoredTransactions(window.localStorage, transactions, userId);
  } catch {
    return STORAGE_WRITE_ERROR;
  }
}
function transactionToRow(userId: string, tx: Transaction) {
  return {
    id: tx.id,
    user_id: userId,
    symbol: tx.symbol,
    name: tx.name,
    transaction_type: tx.type,
    trade_date: tx.date,
    quantity: tx.quantity,
    price: tx.price,
    fee: tx.fee,
    currency: tx.currency ?? null,
    fx_rate_to_krw: tx.fxRateToKRW ?? null,
    usd_krw_rate_at_transaction: tx.usdKrwRateAtTransaction ?? null,
    created_at: tx.createdAt,
  };
}

function rowToTransaction(row: PortfolioTransactionRow): Transaction {
  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    type: row.transaction_type,
    date: row.trade_date,
    quantity: Number(row.quantity),
    price: Number(row.price),
    fee: Number(row.fee),
    currency: row.currency ?? undefined,
    fxRateToKRW:
      row.fx_rate_to_krw == null ? undefined : Number(row.fx_rate_to_krw),
    usdKrwRateAtTransaction:
      row.usd_krw_rate_at_transaction == null
        ? undefined
        : Number(row.usd_krw_rate_at_transaction),
    createdAt: row.created_at,
  };
}

async function upsertTransactions(
  userId: string,
  transactions: Transaction[],
): Promise<string | null> {
  if (transactions.length === 0) return null;
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return "서버 연결을 찾을 수 없습니다.";

  const { error } = await supabase.from("portfolio_transactions").upsert(
    transactions.map((tx) => transactionToRow(userId, tx)),
    {
      onConflict: "id",
    },
  );

  if (error) {
    console.error("포트폴리오 서버 저장 실패", error);
    return "서버 저장에 실패했습니다. 잠시 후 다시 시도해주세요.";
  }
  return null;
}

async function deleteTransactionFromServer(
  userId: string,
  id: string,
): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return "서버 연결을 찾을 수 없습니다.";

  const { error } = await supabase
    .from("portfolio_transactions")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    console.error("포트폴리오 서버 삭제 실패", error);
    return "서버에서 거래를 삭제하지 못했습니다. 잠시 후 다시 시도해주세요.";
  }
  return null;
}

async function deleteTransactionsFromServer(
  userId: string,
  ids: string[],
): Promise<string | null> {
  if (ids.length === 0) return null;
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return "서버 연결을 찾을 수 없습니다.";

  const chunkSize = 200;
  for (let index = 0; index < ids.length; index += chunkSize) {
    const chunk = ids.slice(index, index + chunkSize);
    const { error } = await supabase
      .from("portfolio_transactions")
      .delete()
      .eq("user_id", userId)
      .in("id", chunk);

    if (error) {
      console.error("포트폴리오 서버 일괄 삭제 실패", error);
      return "서버의 기존 거래를 정리하지 못했습니다. 데이터는 교체하지 않았습니다.";
    }
  }
  return null;
}

async function savePreference(userId: string, currency: DisplayCurrency) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;

  const { error } = await supabase.from("portfolio_preferences").upsert(
    {
      user_id: userId,
      display_currency: currency,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) console.error("표시 통화 서버 저장 실패", error);
}

async function enrichLegacyCurrencies(
  transactions: Transaction[],
): Promise<Transaction[]> {
  const currencyPromises = new Map<string, Promise<string>>();
  const fxPromises = new Map<string, Promise<number>>();

  const getCurrency = (symbol: string) => {
    let promise = currencyPromises.get(symbol);
    if (!promise) {
      promise = getQuote(symbol).then((quote) => quote.currency);
      currencyPromises.set(symbol, promise);
    }
    return promise;
  };

  const getHistoricalFx = (currency: string, date: string) => {
    const key = `${currency}:${date}`;
    let promise = fxPromises.get(key);
    if (!promise) {
      promise = getFxRateToKRW(currency, date);
      fxPromises.set(key, promise);
    }
    return promise;
  };

  return Promise.all(
    transactions.map(async (tx) => {
      if (
        tx.currency &&
        tx.fxRateToKRW != null &&
        tx.usdKrwRateAtTransaction != null
      ) {
        return tx;
      }

      try {
        const currency = tx.currency ?? (await getCurrency(tx.symbol));
        const [fxRateToKRW, usdKrwRateAtTransaction] = await Promise.all([
          tx.fxRateToKRW ?? getHistoricalFx(currency, tx.date),
          tx.usdKrwRateAtTransaction ?? getHistoricalFx("USD", tx.date),
        ]);
        return { ...tx, currency, fxRateToKRW, usdKrwRateAtTransaction };
      } catch {
        return tx;
      }
    }),
  );
}

function buildSummary(
  holdings: Holding[],
  quotes: Record<string, StockQuote>,
  fxRatesToKRW: Record<string, number>,
  displayCurrency: DisplayCurrency,
): PortfolioSummary {
  const currentUsdKrwRate = fxRatesToKRW.USD ?? 0;

  const enriched: HoldingWithQuote[] = holdings.map((h) => {
    const quote = quotes[h.symbol];
    const currency = quote?.currency ?? h.currency ?? "USD";
    const normalizedCurrency = normalizeCurrency(currency);
    const fxRate =
      normalizedCurrency === BASE_CURRENCY
        ? 1
        : (fxRatesToKRW[normalizedCurrency] ?? 0);

    const marketValue = quote ? quote.price * h.quantity : 0;
    const costBasis = h.avgCost * h.quantity;
    const gainLoss = marketValue - costBasis;
    const gainLossPercent = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;

    const marketValueKRW =
      fxRate > 0 ? toKRW(marketValue, currency, fxRate) : 0;
    const resolvedCostBasisKRW =
      h.costBasisKRW ?? (fxRate > 0 ? toKRW(costBasis, currency, fxRate) : 0);
    const gainLossKRW = marketValueKRW - resolvedCostBasisKRW;
    const gainLossPercentKRW =
      resolvedCostBasisKRW > 0 ? (gainLossKRW / resolvedCostBasisKRW) * 100 : 0;

    const nativeCostBasisKRWAtUnitRate = toKRW(costBasis, currency, 1);
    const acquisitionFxRateToKRW =
      normalizedCurrency !== BASE_CURRENCY && nativeCostBasisKRWAtUnitRate > 0
        ? resolvedCostBasisKRW / nativeCostBasisKRWAtUnitRate
        : undefined;
    const currentFxRateToKRW =
      normalizedCurrency !== BASE_CURRENCY ? fxRate : undefined;
    const marketValueAtAcquisitionFxKRW =
      acquisitionFxRateToKRW != null
        ? toKRW(marketValue, currency, acquisitionFxRateToKRW)
        : marketValueKRW;
    const stockPriceImpactKRW =
      marketValueAtAcquisitionFxKRW - resolvedCostBasisKRW;
    const fxImpactKRW =
      normalizedCurrency === BASE_CURRENCY
        ? 0
        : marketValueKRW - marketValueAtAcquisitionFxKRW;

    const marketValueUSD = krwToDisplayCurrency(
      marketValueKRW,
      "USD",
      currentUsdKrwRate,
    );
    const resolvedCostBasisUSD =
      h.costBasisUSD ??
      krwToDisplayCurrency(resolvedCostBasisKRW, "USD", currentUsdKrwRate);
    const gainLossUSD = marketValueUSD - resolvedCostBasisUSD;
    const gainLossPercentUSD =
      resolvedCostBasisUSD > 0 ? (gainLossUSD / resolvedCostBasisUSD) * 100 : 0;

    const displayMarketValue =
      displayCurrency === "KRW" ? marketValueKRW : marketValueUSD;
    const displayCostBasis =
      displayCurrency === "KRW" ? resolvedCostBasisKRW : resolvedCostBasisUSD;
    const displayGainLoss =
      displayCurrency === "KRW" ? gainLossKRW : gainLossUSD;
    const displayGainLossPercent =
      displayCurrency === "KRW" ? gainLossPercentKRW : gainLossPercentUSD;

    return {
      ...h,
      currency,
      quote,
      marketValue,
      costBasis,
      gainLoss,
      gainLossPercent,
      marketValueKRW,
      resolvedCostBasisKRW,
      gainLossKRW,
      gainLossPercentKRW,
      marketValueUSD,
      resolvedCostBasisUSD,
      gainLossUSD,
      gainLossPercentUSD,
      displayMarketValue,
      displayCostBasis,
      displayGainLoss,
      displayGainLossPercent,
      acquisitionFxRateToKRW,
      currentFxRateToKRW,
      stockPriceImpactKRW,
      fxImpactKRW,
    };
  });

  const totalValue = enriched.reduce((s, h) => s + h.displayMarketValue, 0);
  const totalCost = enriched.reduce((s, h) => s + h.displayCostBasis, 0);
  const totalGainLoss = totalValue - totalCost;
  const totalGainLossPercent =
    totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;
  const stockPriceImpactKRW = enriched.reduce(
    (sum, holding) => sum + holding.stockPriceImpactKRW,
    0,
  );
  const fxImpactKRW = enriched.reduce(
    (sum, holding) => sum + holding.fxImpactKRW,
    0,
  );

  return {
    baseCurrency: displayCurrency,
    totalAssets: totalValue,
    investmentAssets: totalValue,
    cashAssets: 0,
    investmentGainLoss: totalGainLoss,
    investmentGainLossPercent: totalGainLossPercent,
    stockPriceImpactKRW,
    fxImpactKRW,
    totalValue,
    totalCost,
    totalGainLoss,
    totalGainLossPercent,
    holdings: enriched,
  };
}

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const { user, configured: authConfigured } = useAuth();
  const storageUserId = authConfigured ? (user?.id ?? null) : null;

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [quotes, setQuotes] = useState<Record<string, StockQuote>>({});
  const [fxRatesToKRW, setFxRatesToKRW] = useState<Record<string, number>>({
    KRW: 1,
  });
  const [displayCurrency, setDisplayCurrencyState] = useState<DisplayCurrency>(
    DEFAULT_DISPLAY_CURRENCY,
  );
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [lastMarketUpdateAt, setLastMarketUpdateAt] = useState<number | null>(
    null,
  );
  const [marketDataError, setMarketDataError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const storageReadErrorRef = useRef<string | null>(null);
  const loadedStorageScopeRef = useRef<string | null | undefined>(undefined);
  const transactionVersionRef = useRef(0);
  const refreshInFlightRef = useRef(false);
  const hasLoadedMarketDataRef = useRef(false);

  const holdings = useMemo(() => deriveHoldings(transactions), [transactions]);

  useEffect(() => {
    let cancelled = false;

    const hydratePortfolio = async () => {
      setHydrated(false);
      loadedStorageScopeRef.current = undefined;
      storageReadErrorRef.current = null;
      setStorageError(null);
      transactionVersionRef.current += 1;
      setTransactions([]);
      setQuotes({});
      setFxRatesToKRW({ KRW: 1 });
      setLastMarketUpdateAt(null);
      setMarketDataError(null);
      hasLoadedMarketDataRef.current = false;

      const displayKey = scopedKey(DISPLAY_CURRENCY_KEY, storageUserId);
      let localDisplayCurrency: string | null = null;
      try {
        localDisplayCurrency = localStorage.getItem(displayKey);
        if (!localDisplayCurrency && storageUserId) {
          localDisplayCurrency = localStorage.getItem(DISPLAY_CURRENCY_KEY);
          if (localDisplayCurrency) {
            localStorage.setItem(displayKey, localDisplayCurrency);
            localStorage.removeItem(DISPLAY_CURRENCY_KEY);
          }
        }
      } catch {
        setStorageError(
          "표시 통화를 브라우저에 저장하지 못했습니다. 사이트 저장 권한과 저장 공간을 확인해 주세요.",
        );
      }

      const resolvedLocalCurrency: DisplayCurrency =
        localDisplayCurrency === "USD" ? "USD" : DEFAULT_DISPLAY_CURRENCY;
      const localResult = loadTransactions(storageUserId);
      const localTransactions = localResult.transactions;
      storageReadErrorRef.current = localResult.error;
      if (localResult.error) setStorageError(localResult.error);

      let loadedTransactions = localTransactions;
      let loadedDisplayCurrency = resolvedLocalCurrency;

      if (authConfigured && storageUserId) {
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          const [transactionsResult, preferenceResult] = await Promise.all([
            supabase
              .from("portfolio_transactions")
              .select("*")
              .order("trade_date", { ascending: true })
              .order("created_at", { ascending: true }),
            supabase
              .from("portfolio_preferences")
              .select("display_currency")
              .eq("user_id", storageUserId)
              .maybeSingle(),
          ]);

          if (!transactionsResult.error) {
            const serverTransactions = (
              (transactionsResult.data ?? []) as PortfolioTransactionRow[]
            ).map(rowToTransaction);

            if (serverTransactions.length === 0) {
              loadedTransactions = localTransactions;
              await upsertTransactions(storageUserId, localTransactions);
            } else {
              const merged = new Map(
                serverTransactions.map((tx) => [tx.id, tx] as const),
              );
              for (const tx of localTransactions) {
                if (!merged.has(tx.id)) merged.set(tx.id, tx);
              }
              loadedTransactions = Array.from(merged.values()).sort(
                (a, b) =>
                  a.date.localeCompare(b.date) ||
                  a.createdAt.localeCompare(b.createdAt),
              );

              if (loadedTransactions.length > serverTransactions.length) {
                await upsertTransactions(storageUserId, loadedTransactions);
              }
            }
          } else {
            console.error(
              "포트폴리오 서버 불러오기 실패",
              transactionsResult.error,
            );
          }

          if (
            !preferenceResult.error &&
            preferenceResult.data?.display_currency
          ) {
            loadedDisplayCurrency =
              preferenceResult.data.display_currency === "USD" ? "USD" : "KRW";
          } else if (!preferenceResult.error) {
            await savePreference(storageUserId, resolvedLocalCurrency);
          } else {
            console.error(
              "표시 통화 서버 불러오기 실패",
              preferenceResult.error,
            );
          }
        }
      }

      if (cancelled) return;

      setDisplayCurrencyState(loadedDisplayCurrency);
      try {
        localStorage.setItem(displayKey, loadedDisplayCurrency);
      } catch {
        setStorageError(
          localResult.error ??
            "표시 통화를 브라우저에 저장하지 못했습니다. 사이트 저장 권한과 저장 공간을 확인해 주세요.",
        );
      }
      setTransactions(loadedTransactions);
      // A failed read is never treated as an empty portfolio to persist.
      if (!localResult.error) {
        const writeError = saveTransactions(loadedTransactions, storageUserId);
        if (writeError) setStorageError(writeError);
      }
      loadedStorageScopeRef.current = storageUserId;
      setHydrated(true);

      if (
        !localResult.error &&
        loadedTransactions.some(
          (tx) =>
            !tx.currency ||
            tx.fxRateToKRW == null ||
            tx.usdKrwRateAtTransaction == null,
        )
      ) {
        const enrichmentVersion = transactionVersionRef.current;
        const enriched = await enrichLegacyCurrencies(loadedTransactions);
        if (cancelled || transactionVersionRef.current !== enrichmentVersion)
          return;

        const changed = enriched.some(
          (tx, i) =>
            tx.currency !== loadedTransactions[i]?.currency ||
            tx.fxRateToKRW !== loadedTransactions[i]?.fxRateToKRW ||
            tx.usdKrwRateAtTransaction !==
              loadedTransactions[i]?.usdKrwRateAtTransaction,
        );
        if (changed) {
          const writeError = saveTransactions(enriched, storageUserId);
          if (writeError) {
            setStorageError(writeError);
          } else {
            setTransactions(enriched);
            transactionVersionRef.current += 1;
            if (storageUserId) void upsertTransactions(storageUserId, enriched);
          }
        }
      }
    };

    void hydratePortfolio();

    return () => {
      cancelled = true;
    };
  }, [authConfigured, storageUserId]);

  const checkStorageReady = useCallback((): string | null => {
    if (storageReadErrorRef.current) return storageReadErrorRef.current;
    if (!hydrated || loadedStorageScopeRef.current !== storageUserId) {
      return "거래 내역을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.";
    }
    return null;
  }, [hydrated, storageUserId]);

  const persistTransactions = useCallback(
    (nextTransactions: Transaction[]): string | null => {
      const blocked = checkStorageReady();
      if (blocked) return blocked;
      const writeError = saveTransactions(nextTransactions, storageUserId);
      if (writeError) {
        const message = storageUserId
          ? `${writeError} 서버에 반영된 거래가 있을 수 있으니 연결 복구 후 거래 내역을 확인해 주세요.`
          : writeError;
        setStorageError(message);
        return message;
      }
      setStorageError(null);
      transactionVersionRef.current += 1;
      setTransactions(nextTransactions);
      return null;
    },
    [checkStorageReady, storageUserId],
  );

  const setDisplayCurrency = useCallback(
    (currency: DisplayCurrency) => {
      setDisplayCurrencyState(currency);
      try {
        localStorage.setItem(
          scopedKey(DISPLAY_CURRENCY_KEY, storageUserId),
          currency,
        );
      } catch {
        setStorageError(
          storageReadErrorRef.current ??
            "표시 통화를 브라우저에 저장하지 못했습니다. 사이트 저장 권한과 저장 공간을 확인해 주세요.",
        );
      }
      if (storageUserId) void savePreference(storageUserId, currency);
    },
    [storageUserId],
  );

  const refreshQuotes = useCallback(async () => {
    if (holdings.length === 0) {
      setQuotes({});
      setFxRatesToKRW({ KRW: 1 });
      setLastMarketUpdateAt(null);
      setMarketDataError(null);
      hasLoadedMarketDataRef.current = false;
      return;
    }

    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;

    if (!hasLoadedMarketDataRef.current) setLoading(true);

    try {
      const quoteResults = await Promise.allSettled(
        holdings.map((h) => getQuote(h.symbol)),
      );

      const successfulQuotes: Record<string, StockQuote> = {};
      let quoteFailures = 0;
      quoteResults.forEach((result, i) => {
        if (result.status === "fulfilled") {
          successfulQuotes[holdings[i].symbol] = result.value;
        } else {
          quoteFailures += 1;
        }
      });

      // 실패한 종목은 기존 정상 시세를 유지하고 성공한 종목만 덮어씁니다.
      if (Object.keys(successfulQuotes).length > 0) {
        setQuotes((previous) => ({ ...previous, ...successfulQuotes }));
      }

      const currencies = Array.from(
        new Set([
          "USD",
          ...holdings
            .map((holding) =>
              normalizeCurrency(
                successfulQuotes[holding.symbol]?.currency ??
                  holding.currency ??
                  "USD",
              ),
            )
            .filter((currency) => currency !== BASE_CURRENCY),
        ]),
      );

      const fxResults = await Promise.allSettled(
        currencies.map(
          async (currency) =>
            [currency, await getFxRateToKRW(currency)] as const,
        ),
      );

      const successfulFxRates: Record<string, number> = {};
      let fxFailures = 0;
      fxResults.forEach((result) => {
        if (result.status === "fulfilled") {
          const [currency, rate] = result.value;
          successfulFxRates[currency] = rate;
        } else {
          fxFailures += 1;
        }
      });

      // 환율 조회 실패 때도 마지막 정상 환율을 유지합니다.
      setFxRatesToKRW((previous) => ({
        ...previous,
        KRW: 1,
        ...successfulFxRates,
      }));

      if (quoteFailures === 0 && fxFailures === 0) {
        setLastMarketUpdateAt(Date.now());
        setMarketDataError(null);
      } else {
        setMarketDataError("일부 시세 또는 환율을 업데이트하지 못했습니다.");
      }
    } catch (error) {
      console.error("시장 데이터 자동 업데이트 실패", error);
      setMarketDataError("시세 또는 환율을 업데이트하지 못했습니다.");
    } finally {
      hasLoadedMarketDataRef.current = true;
      refreshInFlightRef.current = false;
      setLoading(false);
    }
  }, [holdings]);

  useEffect(() => {
    if (!hydrated || holdings.length === 0) return;

    let intervalId: number | null = null;

    const stopInterval = () => {
      if (intervalId != null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    const startInterval = () => {
      stopInterval();
      if (document.visibilityState !== "visible") return;
      intervalId = window.setInterval(() => {
        void refreshQuotes();
      }, MARKET_REFRESH_INTERVAL_MS);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshQuotes();
        startInterval();
      } else {
        stopInterval();
      }
    };

    const initialRefreshTimer = window.setTimeout(() => {
      if (document.visibilityState === "visible") {
        void refreshQuotes();
        startInterval();
      }
    }, 0);

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearTimeout(initialRefreshTimer);
      stopInterval();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [hydrated, holdings.length, refreshQuotes]);

  const addTransaction = useCallback(
    (input: AddTransactionInput): string | null => {
      const blocked = checkStorageReady();
      if (blocked) return blocked;
      const upper = input.symbol.toUpperCase();
      const fee = input.fee ?? 0;

      const tx: Transaction = {
        id: crypto.randomUUID(),
        symbol: upper,
        name: input.name,
        type: input.type,
        date: input.date,
        quantity: input.quantity,
        price: input.price,
        fee,
        currency: input.currency,
        fxRateToKRW: input.fxRateToKRW,
        usdKrwRateAtTransaction: input.usdKrwRateAtTransaction,
        createdAt: new Date().toISOString(),
      };

      const historyError = validateTransactionHistory([...transactions, tx]);
      if (historyError) return historyError;

      const writeError = persistTransactions([...transactions, tx]);
      if (writeError) return writeError;
      if (storageUserId) void upsertTransactions(storageUserId, [tx]);
      return null;
    },
    [transactions, storageUserId, checkStorageReady, persistTransactions],
  );

  const updateTransaction = useCallback(
    async (
      id: string,
      input: UpdateTransactionInput,
    ): Promise<string | null> => {
      const blocked = checkStorageReady();
      if (blocked) return blocked;
      const original = transactions.find((tx) => tx.id === id);
      if (!original) return "수정할 거래를 찾지 못했습니다.";

      if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
        return "수량은 0보다 커야 합니다.";
      }
      if (!Number.isFinite(input.price) || input.price <= 0) {
        return "단가는 0보다 커야 합니다.";
      }
      const fee = input.fee ?? 0;
      if (!Number.isFinite(fee) || fee < 0) {
        return "수수료는 0 이상이어야 합니다.";
      }

      let currency = original.currency;
      let fxRateToKRW = original.fxRateToKRW;
      let usdKrwRateAtTransaction = original.usdKrwRateAtTransaction;

      if (
        input.date !== original.date ||
        !currency ||
        fxRateToKRW == null ||
        usdKrwRateAtTransaction == null
      ) {
        try {
          currency = currency ?? (await getQuote(original.symbol)).currency;
          [fxRateToKRW, usdKrwRateAtTransaction] = await Promise.all([
            getFxRateToKRW(currency, input.date),
            getFxRateToKRW("USD", input.date),
          ]);
        } catch {
          return "거래일 환율을 불러오지 못해 수정하지 않았습니다.";
        }
      }

      const updated: Transaction = {
        ...original,
        type: input.type,
        date: input.date,
        quantity: input.quantity,
        price: input.price,
        fee,
        currency,
        fxRateToKRW,
        usdKrwRateAtTransaction,
      };
      const nextTransactions = transactions.map((tx) =>
        tx.id === id ? updated : tx,
      );
      const historyError = validateTransactionHistory(nextTransactions);
      if (historyError) return historyError;

      if (storageUserId) {
        const serverError = await upsertTransactions(storageUserId, [updated]);
        if (serverError) return serverError;
      }

      return persistTransactions(nextTransactions);
    },
    [transactions, storageUserId, checkStorageReady, persistTransactions],
  );

  const removeTransaction = useCallback(
    async (id: string): Promise<string | null> => {
      const blocked = checkStorageReady();
      if (blocked) return blocked;
      const original = transactions.find((tx) => tx.id === id);
      if (!original) return "삭제할 거래를 찾지 못했습니다.";

      const nextTransactions = transactions.filter((tx) => tx.id !== id);
      const historyError = validateTransactionHistory(nextTransactions);
      if (historyError) {
        return `이 거래를 삭제하면 거래 기록이 모순됩니다. ${historyError}`;
      }

      if (storageUserId) {
        const serverError = await deleteTransactionFromServer(
          storageUserId,
          id,
        );
        if (serverError) return serverError;
      }

      return persistTransactions(nextTransactions);
    },
    [transactions, storageUserId, checkStorageReady, persistTransactions],
  );

  const restoreTransaction = useCallback(
    async (transaction: Transaction): Promise<string | null> => {
      const blocked = checkStorageReady();
      if (blocked) return blocked;
      if (transactions.some((tx) => tx.id === transaction.id)) return null;

      const nextTransactions = [...transactions, transaction];
      const historyError = validateTransactionHistory(nextTransactions);
      if (historyError) return historyError;

      if (storageUserId) {
        const serverError = await upsertTransactions(storageUserId, [
          transaction,
        ]);
        if (serverError) return serverError;
      }

      return persistTransactions(nextTransactions);
    },
    [transactions, storageUserId, checkStorageReady, persistTransactions],
  );

  const importTransactions = useCallback(
    async (
      importedTransactions: Transaction[],
      mode: TransactionImportMode,
    ): Promise<TransactionImportResult> => {
      const blocked = checkStorageReady();
      if (blocked) return { error: blocked, importedCount: 0, skippedCount: 0 };
      const enrichedImported =
        await enrichLegacyCurrencies(importedTransactions);

      let nextTransactions: Transaction[];
      let transactionsToUpsert: Transaction[];
      let skippedCount = 0;

      if (mode === "merge") {
        const existingIds = new Set(transactions.map((tx) => tx.id));
        const newTransactions = enrichedImported.filter(
          (tx) => !existingIds.has(tx.id),
        );
        skippedCount = enrichedImported.length - newTransactions.length;
        nextTransactions = [...transactions, ...newTransactions];
        transactionsToUpsert = newTransactions;
      } else {
        nextTransactions = enrichedImported;
        transactionsToUpsert = enrichedImported;
      }

      nextTransactions.sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          a.createdAt.localeCompare(b.createdAt),
      );

      const historyError = validateTransactionHistory(nextTransactions);
      if (historyError) {
        return {
          error: `현재 거래와 함께 적용할 수 없습니다. ${historyError}`,
          importedCount: 0,
          skippedCount,
        };
      }

      if (storageUserId) {
        const serverError = await upsertTransactions(
          storageUserId,
          transactionsToUpsert,
        );
        if (serverError) {
          return { error: serverError, importedCount: 0, skippedCount };
        }

        if (mode === "replace") {
          const importedIds = new Set(enrichedImported.map((tx) => tx.id));
          const removedIds = transactions
            .filter((tx) => !importedIds.has(tx.id))
            .map((tx) => tx.id);
          const deleteError = await deleteTransactionsFromServer(
            storageUserId,
            removedIds,
          );
          if (deleteError) {
            return { error: deleteError, importedCount: 0, skippedCount };
          }
        }
      }

      const writeError = persistTransactions(nextTransactions);
      if (writeError)
        return { error: writeError, importedCount: 0, skippedCount };
      return {
        error: null,
        importedCount:
          mode === "merge"
            ? transactionsToUpsert.length
            : nextTransactions.length,
        skippedCount,
      };
    },
    [transactions, storageUserId, checkStorageReady, persistTransactions],
  );

  const summary = useMemo(
    () =>
      holdings.length > 0
        ? buildSummary(holdings, quotes, fxRatesToKRW, displayCurrency)
        : null,
    [holdings, quotes, fxRatesToKRW, displayCurrency],
  );

  return (
    <PortfolioContext.Provider
      value={{
        transactions,
        holdings,
        summary,
        loading,
        displayCurrency,
        lastMarketUpdateAt,
        marketDataError,
        storageError,
        setDisplayCurrency,
        addTransaction,
        updateTransaction,
        removeTransaction,
        restoreTransaction,
        importTransactions,
        refreshQuotes,
      }}
    >
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio() {
  const ctx = useContext(PortfolioContext);
  if (!ctx)
    throw new Error("usePortfolio must be used within PortfolioProvider");
  return ctx;
}
