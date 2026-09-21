"use client";

import { buildHoldingAllocation, formatAllocationWeight } from "@/features/portfolio/model/holding-allocation";
import { carriedFxLabel, dailyReferenceLabel } from "@/features/portfolio/model/daily-reference-label";
import styles from "@/features/portfolio/ui/PortfolioHoldings.module.css";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency, formatPercent } from "@/lib/format";
import { MARKETS, marketForSymbol, matchesStockQuery } from "@/lib/markets";
import type { DisplayCurrency, HoldingWithQuote, Transaction } from "@/lib/types";
import { Pencil, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState, type ReactNode } from "react";
import { AssetAvatar, EmptyPortfolio } from "./AssetAvatar";
import { HoldingManagement, type HoldingAction } from "./HoldingManagement";

interface Props {
  holdings: HoldingWithQuote[];
  transactions?: Transaction[];
  displayCurrency: DisplayCurrency;
  compact?: boolean;
  loading?: boolean;
  editable?: boolean;
  toolbarAction?: ReactNode;
  dailyChanges?: Record<string, number>;
  dailyChangeReason?: string | null;
  referenceDatesBySymbol?: Record<string, string[]>;
  carriedDatesBySymbol?: Record<string, string[]>;
}

type Sort = "value" | "gainAmount" | "gainPercent" | "dailyHigh" | "dailyLow";
const HOLDINGS_BATCH_SIZE = 20;
const EMPTY_TRANSACTIONS: Transaction[] = [];
const signedMoney = (value: number, currency: DisplayCurrency) => `${value > 0 ? "+" : ""}${formatCurrency(value, currency)}`;
const changeClass = (value: number) => value > 0 ? styles.positive : value < 0 ? styles.negative : "";

export function HoldingsTable({
  holdings, transactions = EMPTY_TRANSACTIONS, displayCurrency, compact = false, loading, editable = false,
  toolbarAction, dailyChanges, dailyChangeReason, referenceDatesBySymbol, carriedDatesBySymbol,
}: Props) {
  const { user } = useAuth();
  const scope = user?.id ?? "guest";
  const [target, setTarget] = useState<(HoldingAction & { scope: string }) | null>(null);
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState<Sort>("value");
  const [query, setQuery] = useState("");
  const [displayLimit, setDisplayLimit] = useState({ scope, count: HOLDINGS_BATCH_SIZE });
  const tableId = useId();
  if (displayLimit.scope !== scope) {
    setDisplayLimit({ scope, count: HOLDINGS_BATCH_SIZE });
  }
  const limit = displayLimit.scope === scope ? displayLimit.count : HOLDINGS_BATCH_SIZE;
  const resetDisplayLimit = () => setDisplayLimit({ scope, count: HOLDINGS_BATCH_SIZE });
  const allocation = useMemo(() => buildHoldingAllocation(holdings), [holdings]);
  const latestTradeDates = useMemo(() => {
    const dates = new Map<string, string>();
    for (const transaction of transactions) {
      if (transaction.date > (dates.get(transaction.symbol) ?? "")) {
        dates.set(transaction.symbol, transaction.date);
      }
    }
    return dates;
  }, [transactions]);
  const visible = useMemo(() => {
    const amount = (holding: HoldingWithQuote) => {
      if (sort === "dailyHigh" || sort === "dailyLow") return dailyChanges?.[holding.symbol] ?? null;
      if (sort === "value") return holding.valuationAvailable ? holding.displayMarketValue : null;
      return holding.gainAvailable ? sort === "gainAmount" ? holding.displayGainLoss : holding.displayGainLossPercent : null;
    };
    return holdings.filter((holding) =>
      (filter === "all" || marketForSymbol(holding.symbol) === filter) &&
      matchesStockQuery(query, holding.symbol, holding.name),
    ).sort((a, b) => {
      const left = amount(a);
      const right = amount(b);
      const comparison = left == null || right == null
        ? left == null ? right == null ? 0 : 1 : -1
        : sort === "dailyLow" ? left - right : right - left;
      if (comparison !== 0) return comparison;
      const leftDate = latestTradeDates.get(a.symbol) ?? "";
      const rightDate = latestTradeDates.get(b.symbol) ?? "";
      if (leftDate !== rightDate) return leftDate > rightDate ? -1 : 1;
      return a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0;
    });
  }, [holdings, filter, query, sort, dailyChanges, latestTradeDates]);
  const displayed = visible.slice(0, limit);
  const remaining = visible.length - displayed.length;

  return (
    <section className={styles.holdings} aria-label="보유종목">
      <div className={styles.toolbar}>
        <h2>보유종목 <span>{holdings.length}</span></h2>
        <div className={styles.toolbarActions}>
          {compact ? <Link href="/portfolio" className="subtle-link">전체 보기</Link> : (
            <label className={styles.search}>
              <Search size={16} aria-hidden="true" />
              <input aria-label="보유 종목 검색" placeholder="종목명 또는 티커" value={query}
                onChange={(event) => { setQuery(event.target.value); resetDisplayLimit(); }} />
            </label>
          )}
          {holdings.length > 0 && <>
            <select className={styles.selectControl} aria-label="보유 종목 시장 필터" value={filter}
              onChange={(event) => { setFilter(event.target.value); resetDisplayLimit(); }}>
              <option value="all">전체 시장</option>
              {MARKETS.map((market) => <option key={market.id} value={market.id}>{market.label}</option>)}
              <option value="other">기타</option>
            </select>
            <select className={styles.selectControl} aria-label="보유종목 정렬" value={sort}
              onChange={(event) => { setSort(event.target.value as Sort); resetDisplayLimit(); }}>
              <option value="value">비중 높은 순</option>
              <option value="gainAmount">평가손익 금액순</option>
              <option value="gainPercent">평가수익률 높은 순</option>
              <option value="dailyHigh" disabled={!dailyChanges}>오늘 손익 높은 순</option>
              <option value="dailyLow" disabled={!dailyChanges}>오늘 손익 낮은 순</option>
            </select>
          </>}
          {toolbarAction}
        </div>
      </div>
      {holdings.length === 0 ? <EmptyPortfolio compact={compact} /> : visible.length === 0 ? (
        <p className={styles.empty}>조건에 맞는 보유 종목이 없습니다.</p>
      ) : (
        <table id={tableId} className={styles.table}>
          <thead>
            <tr>
              <th scope="col">종목 · 보유수량</th>
              <th scope="col">평가액</th>
              <th scope="col">평가손익</th>
              <th scope="col" title="한국시간 오늘 00:00 이후 종목별 투자 변동">오늘 손익</th>
              <th scope="col" title="전체 주식·ETF 평가액에서 차지하는 비중">비중</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((holding) => {
              const daily = dailyChanges?.[holding.symbol];
              const hasDaily = daily != null && Number.isFinite(daily);
              const referenceLabel = dailyReferenceLabel(referenceDatesBySymbol?.[holding.symbol]);
              const carriedLabel = carriedFxLabel(carriedDatesBySymbol?.[holding.symbol]);
              const price = holding.quote?.price;
              const hasPrice = price != null && Number.isFinite(price) && price > 0;
              const weight = allocation.weights[holding.id];
              return (
                <tr key={holding.id}>
                  <td className={styles.asset}>
                    <div className={styles.assetMain}>
                      <Link href={`/stock/${encodeURIComponent(holding.symbol)}`} className={styles.assetLink}>
                        <AssetAvatar symbol={holding.symbol} logoUrl={holding.quote?.logoUrl} small />
                        <span><strong>{holding.name}</strong><small>{holding.symbol.replace(".KS", "").replace(".KQ", "")}</small></span>
                      </Link>
                      {editable && <div className={styles.rowActions}>
                        <button type="button" title="보유종목 수정" onClick={() => setTarget({ symbol: holding.symbol, name: holding.name, action: "edit", scope })} aria-label={`${holding.symbol} 보유종목 수정`}><Pencil size={16} /></button>
                        <button type="button" title="보유종목 삭제" onClick={() => setTarget({ symbol: holding.symbol, name: holding.name, action: "delete", scope })} aria-label={`${holding.symbol} 보유종목 삭제`} className={styles.delete}><Trash2 size={16} /></button>
                      </div>}
                    </div>
                    <p className={styles.position}>{holding.quantity.toLocaleString("ko-KR")}주 · 평균 {holding.currency ? formatCurrency(holding.avgCost, holding.currency) : "통화 확인 중"}</p>
                  </td>
                  <td data-label="평가액">
                    <strong>{holding.valuationAvailable ? formatCurrency(holding.displayMarketValue, displayCurrency) : "—"}</strong>
                    <span className={styles.subvalue}>{hasPrice ? `현재가 ${formatCurrency(price, holding.quote?.currency)}` : loading ? "시세 확인 중" : "시세 미확인"}</span>
                    {hasPrice && !holding.valuationAvailable && <span className={styles.subvalue}>시세·환율 확인 필요</span>}
                  </td>
                  <td data-label="평가손익">
                    <strong className={holding.gainAvailable ? changeClass(holding.displayGainLoss) : ""}>{holding.gainAvailable ? signedMoney(holding.displayGainLoss, displayCurrency) : "—"}</strong>
                    <span className={`${styles.subvalue} ${holding.gainAvailable ? changeClass(holding.displayGainLoss) : ""}`}>{holding.gainAvailable ? formatPercent(holding.displayGainLossPercent) : loading ? "계산 자료 확인 중" : "계산 자료 미확인"}</span>
                  </td>
                  <td data-label="오늘 손익" title={hasDaily ? undefined : dailyChangeReason ?? "자정 기준 자료를 확인하지 못했습니다."}>
                    <strong className={hasDaily ? changeClass(daily) : ""}>{hasDaily ? signedMoney(daily, displayCurrency) : "—"}</strong>
                    {hasDaily && referenceLabel ? <span className={styles.subvalue}>{referenceLabel}</span> : null}
                    {hasDaily && carriedLabel ? <span className={styles.subvalue}>{carriedLabel}</span> : null}
                  </td>
                  <td data-label="비중" className={styles.weight}>
                    <strong>{allocation.available ? formatAllocationWeight(weight) : "—"}</strong>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {visible.length > HOLDINGS_BATCH_SIZE && (
        <div className={styles.holdingsMore}>
          <span role="status" aria-live="polite">{displayed.length} / {visible.length}종목 표시</span>
          {remaining > 0 && (
            <button type="button" aria-controls={tableId}
              onClick={() => setDisplayLimit({ scope, count: Math.min(limit + HOLDINGS_BATCH_SIZE, visible.length) })}>
              {Math.min(HOLDINGS_BATCH_SIZE, remaining)}개 더 보기
            </button>
          )}
        </div>
      )}
      {editable && <HoldingManagement key={scope} target={target?.scope === scope ? target : null} onClose={() => setTarget(null)} />}
    </section>
  );
}
