"use client";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency,formatPercent } from "@/lib/format";
import { MARKETS,marketForSymbol } from "@/lib/markets";
import type { DisplayCurrency,HoldingWithQuote } from "@/lib/types";
import { ArrowDownUp,Pencil,Search,Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo,useState } from "react";
import { AssetAvatar,EmptyPortfolio } from "./AssetAvatar";
import { HoldingManagement,type HoldingAction } from "./HoldingManagement";
interface Props {
  holdings: HoldingWithQuote[];
  displayCurrency: DisplayCurrency;
  compact?: boolean;
  loading?: boolean;
  editable?: boolean;
}
export function HoldingsTable({
  holdings,
  displayCurrency,
  compact = false,
  loading,
  editable = false,
}: Props) {
  const { user } = useAuth();
  const scope = user?.id ?? "guest";
  const [target, setTarget] = useState<(HoldingAction & { scope: string }) | null>(null);
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState<"value" | "gain">("value");
  const [query, setQuery] = useState("");
  const total = holdings.reduce((sum, h) => sum + h.displayMarketValue, 0);
  const visible = useMemo(
    () =>
      holdings
        .filter(
          (h) =>
            (filter === "all" ||
              marketForSymbol(h.symbol) === filter) &&
            (!query ||
              `${h.symbol} ${h.name}`
                .toLowerCase()
                .includes(query.toLowerCase())),
        )
        .sort((a, b) =>
          sort === "value"
            ? b.displayMarketValue - a.displayMarketValue
            : b.displayGainLossPercent - a.displayGainLossPercent,
        ),
    [holdings, filter, query, sort],
  );
  return (
    <section className={`surface ${compact ? "compact-table" : ""}`}>
      <div className="surface-header">
        <h2>
          보유 종목<span className="table-count">{holdings.length}</span>
        </h2>
        {compact ? (
          <Link href="/portfolio" className="subtle-link">
            전체 보기
          </Link>
        ) : (
          <div className="portfolio-controls">
            <Search size={13} color="#9aaa94" />
            <input
              aria-label="보유 종목 검색"
              placeholder="종목명 또는 티커"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        )}
      </div>
      <div
        className="table-filters"
        role="group"
        aria-label="보유 종목 시장 필터"
      >
        {[
          { value: "all", label: "전체" },
          ...MARKETS.map((market) => ({ value: market.id, label: market.label })),
          { value: "other", label: "기타" },
        ].map((item) => (
          <button
            key={item.value}
            onClick={() => setFilter(item.value)}
            aria-pressed={filter === item.value}
            className={filter === item.value ? "selected" : ""}
          >
            {item.label}
          </button>
        ))}
      </div>
      {holdings.length === 0 ? (
        <EmptyPortfolio compact={compact} />
      ) : visible.length === 0 ? (
        <div className="empty-chart">조건에 맞는 보유 종목이 없습니다.</div>
      ) : (
        <div className="table-overflow">
          <table className="holdings-table">
            <thead>
              <tr>
                <th scope="col">종목명</th>
                <th scope="col" className="holding-quantity">
                  보유 수량
                </th>
                <th scope="col" className="holding-price">
                  현재가
                </th>
                <th scope="col">
                  <button
                    className="table-sort-button"
                    onClick={() => setSort("value")}
                    aria-label="평가액 높은 순 정렬"
                  >
                    평가액 <ArrowDownUp size={10} />
                  </button>
                </th>
                <th scope="col">
                  <button
                    className="table-sort-button"
                    onClick={() => setSort("gain")}
                    aria-label="수익률 높은 순 정렬"
                  >
                    평가손익 <ArrowDownUp size={10} />
                  </button>
                </th>
                <th scope="col" className="holding-weight">
                  비중
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((h) => (
                <tr key={h.id}>
                  <td>
                    <Link
                      href={`/stock/${encodeURIComponent(h.symbol)}`}
                      className="asset-cell"
                    >
                      <AssetAvatar symbol={h.symbol} logoUrl={h.quote?.logoUrl} />
                      <span>
                        <strong>{h.name}</strong>
                        <small>
                          {h.symbol.replace(".KS", "").replace(".KQ", "")} ·{" "}
                          {h.currency ?? "통화 확인 중"}
                        </small>
                      </span>
                    </Link>
                    {editable && <div className="mt-2 flex items-center gap-1 pl-11">
                      <button type="button" onClick={() => setTarget({ symbol: h.symbol, name: h.name, action: "edit", scope })}
                        aria-label={`${h.symbol} 보유종목 수정`} className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-[#626873] hover:bg-[#edf0f3] hover:text-[#202329]">
                        <Pencil size={12} />수정
                      </button>
                      <button type="button" onClick={() => setTarget({ symbol: h.symbol, name: h.name, action: "delete", scope })}
                        aria-label={`${h.symbol} 보유종목 삭제`} className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-[#626873] hover:bg-[#fceeee] hover:text-[#b44848]">
                        <Trash2 size={12} />삭제
                      </button>
                    </div>}
                  </td>
                  <td className="holding-quantity">
                    {h.quantity.toLocaleString("ko-KR")}
                    <span className="table-subvalue">
                      평균 {formatCurrency(h.avgCost, h.currency)}
                    </span>
                  </td>
                  <td className="holding-price">
                    {h.quote ? formatCurrency(h.quote.price, h.currency) : "—"}
                    <span
                      className={`table-subvalue ${(h.quote?.changePercent ?? 0) >= 0 ? "positive" : "negative"}`}
                    >
                      {h.quote
                        ? formatPercent(h.quote.changePercent)
                        : "시세 미확인"}
                    </span>
                  </td>
                  <td>
                    {h.quote
                      ? formatCurrency(h.displayMarketValue, displayCurrency)
                      : "—"}
                    <span className="table-subvalue">
                      {h.quantity.toLocaleString("ko-KR")}주
                    </span>
                  </td>
                  <td>
                    <span
                      className={
                        h.displayGainLoss >= 0 ? "positive" : "negative"
                      }
                    >
                      {h.quote
                        ? `${h.displayGainLoss >= 0 ? "+" : ""}${formatCurrency(h.displayGainLoss, displayCurrency)}`
                        : "—"}
                    </span>
                    <span
                      className={`table-subvalue ${h.displayGainLoss >= 0 ? "positive" : "negative"}`}
                    >
                      {h.quote
                        ? formatPercent(h.displayGainLossPercent)
                        : loading
                          ? "시세 확인 중"
                          : "시세 미확인"}
                    </span>
                  </td>
                  <td className="holding-weight">
                    {total > 0
                      ? `${((h.displayMarketValue / total) * 100).toFixed(1)}%`
                      : "—"}
                    <div className="weight-bar">
                      <span
                        style={{
                          width: `${total > 0 ? (h.displayMarketValue / total) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editable && <HoldingManagement key={scope} target={target?.scope === scope ? target : null} onClose={() => setTarget(null)} />}
    </section>
  );
}
