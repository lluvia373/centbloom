"use client";

import { buildHoldingAllocation, formatAllocationWeight } from "@/features/portfolio/model/holding-allocation";
import styles from "@/features/portfolio/ui/PortfolioHoldings.module.css";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency, formatPercent } from "@/lib/format";
import { MARKETS, marketForSymbol, matchesStockQuery } from "@/lib/markets";
import type { DisplayCurrency, HoldingWithQuote } from "@/lib/types";
import { Pencil, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { AssetAvatar, EmptyPortfolio } from "./AssetAvatar";
import { HoldingManagement, type HoldingAction } from "./HoldingManagement";

interface Props {
  holdings: HoldingWithQuote[];
  displayCurrency: DisplayCurrency;
  compact?: boolean;
  loading?: boolean;
  editable?: boolean;
  toolbarAction?: ReactNode;
  dailyChanges?: Record<string, number>;
  dailyChangeReason?: string | null;
}

type Sort = "value" | "gainAmount" | "gainPercent" | "dailyHigh" | "dailyLow";
const signedMoney = (value: number, currency: DisplayCurrency) => `${value > 0 ? "+" : ""}${formatCurrency(value, currency)}`;
const changeClass = (value: number) => value > 0 ? styles.positive : value < 0 ? styles.negative : "";

export function HoldingsTable({
  holdings, displayCurrency, compact = false, loading, editable = false,
  toolbarAction, dailyChanges, dailyChangeReason,
}: Props) {
  const { user } = useAuth();
  const scope = user?.id ?? "guest";
  const [target, setTarget] = useState<(HoldingAction & { scope: string }) | null>(null);
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState<Sort>("value");
  const [query, setQuery] = useState("");
  const allocation = buildHoldingAllocation(holdings);
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
      if (left == null || right == null) return left == null ? right == null ? 0 : 1 : -1;
      return sort === "dailyLow" ? left - right : right - left;
    });
  }, [holdings, filter, query, sort, dailyChanges]);

  return (
    <section className={styles.holdings} aria-label="보유종목">
      <div className={styles.toolbar}>
        <h2>보유종목 <span>{holdings.length}</span></h2>
        <div className={styles.toolbarActions}>
          {compact ? <Link href="/portfolio" className="subtle-link">전체 보기</Link> : (
            <label className={styles.search}>
              <Search size={16} aria-hidden="true" />
              <input aria-label="보유 종목 검색" placeholder="종목명 또는 티커" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
          )}
          {holdings.length > 0 && <>
            <select className={styles.selectControl} aria-label="보유 종목 시장 필터" value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="all">전체 시장</option>
              {MARKETS.map((market) => <option key={market.id} value={market.id}>{market.label}</option>)}
              <option value="other">기타</option>
            </select>
            <select className={styles.selectControl} aria-label="보유종목 정렬" value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
              <option value="value">평가액 높은 순</option>
              <option value="gainAmount">평가손익 금액순</option>
              <option value="gainPercent">평가수익률 높은 순</option>
              <option value="dailyHigh" disabled={!dailyChanges}>오늘 기여 높은 순</option>
              <option value="dailyLow" disabled={!dailyChanges}>오늘 기여 낮은 순</option>
            </select>
          </>}
          {toolbarAction}
        </div>
      </div>
      {holdings.length === 0 ? <EmptyPortfolio compact={compact} /> : visible.length === 0 ? (
        <p className={styles.empty}>조건에 맞는 보유 종목이 없습니다.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">종목 · 보유수량</th>
              <th scope="col">평가액</th>
              <th scope="col">평가손익</th>
              <th scope="col" title="한국시간 오늘 00:00 이후 종목별 투자 변동">오늘 기여</th>
              <th scope="col" title="전체 주식·ETF 평가액에서 차지하는 비중">비중</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((holding) => {
              const daily = dailyChanges?.[holding.symbol];
              const hasDaily = daily != null && Number.isFinite(daily);
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
                  <td data-label="오늘 기여" title={hasDaily ? undefined : dailyChangeReason ?? "자정 기준 자료를 확인하지 못했습니다."}>
                    <strong className={hasDaily ? changeClass(daily) : ""}>{hasDaily ? signedMoney(daily, displayCurrency) : "—"}</strong>
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
      {editable && <HoldingManagement key={scope} target={target?.scope === scope ? target : null} onClose={() => setTarget(null)} />}
    </section>
  );
}
