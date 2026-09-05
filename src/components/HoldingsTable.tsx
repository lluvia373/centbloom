"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownUp, ArrowUpRight, Search } from "lucide-react";
import { AssetAvatar, EmptyPortfolio } from "./AssetAvatar";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { DisplayCurrency, HoldingWithQuote } from "@/lib/types";
interface Props {
  holdings: HoldingWithQuote[];
  displayCurrency: DisplayCurrency;
  compact?: boolean;
  loading?: boolean;
  onRemove?: (id: string) => void;
}
export function HoldingsTable({
  holdings,
  displayCurrency,
  compact = false,
  loading,
}: Props) {
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
              (filter === "kr"
                ? h.currency === "KRW"
                : h.currency !== "KRW")) &&
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
            전체 보기 <ArrowUpRight size={13} />
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
          { value: "us", label: "해외 주식" },
          { value: "kr", label: "국내 주식" },
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
                      <AssetAvatar symbol={h.symbol} />
                      <span>
                        <strong>{h.name}</strong>
                        <small>
                          {h.symbol.replace(".KS", "").replace(".KQ", "")} ·{" "}
                          {h.currency ?? "통화 확인 중"}
                        </small>
                      </span>
                    </Link>
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
    </section>
  );
}
