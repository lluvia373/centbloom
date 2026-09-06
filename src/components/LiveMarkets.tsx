"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { discoveryStocks, type MarketFilter } from "@/lib/markets";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { formatCurrency, formatPercent } from "@/lib/format";
import { MarketPicker } from "./MarketPicker";
import { QuoteStatus } from "./QuoteStatus";
import { AssetAvatar } from "./AssetAvatar";

export function LiveMarkets() {
  const [market, setMarket] = useState<MarketFilter>("kr");
  const stocks = discoveryStocks(market);
  const { quotes, failedSymbols, refreshing, loading, refresh } = useLiveQuotes(stocks.map((stock) => stock.symbol));
  return (
    <section className="mb-6 rounded-2xl border border-[#e6e8eb] bg-white p-5 sm:p-6" aria-label="세계 주식 시세">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-[#202329]">세계 주식</h2>
          <p className="mt-1 text-xs text-[#727680]">실제 시세 · 30초 갱신</p>
        </div>
        <button type="button" onClick={refresh} disabled={refreshing} aria-label="세계 주식 시세 새로고침"
          className="rounded-lg p-2 text-[#727680] hover:bg-[#f3f4f6] disabled:opacity-40">
          <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
        </button>
      </div>
      <MarketPicker value={market} onChange={setMarket} includeAll={false} />
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {stocks.map((stock) => {
          const quote = quotes[stock.symbol];
          return (
            <Link key={stock.symbol} href={`/stock/${encodeURIComponent(stock.symbol)}`}
              className="min-w-0 rounded-xl border border-[#eceef0] p-4 transition-colors hover:bg-[#f8f9fa]">
              <div className="flex items-center justify-between gap-2">
                <AssetAvatar symbol={stock.symbol} logoUrl={quote?.logoUrl} small />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#202329]">{stock.name}</span>
                <ArrowUpRight size={13} className="shrink-0 text-[#727680]" />
              </div>
              <p className="mt-1 text-[11px] text-[#727680]">{stock.symbol} · {stock.exchange}</p>
              {quote ? <>
                <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 tabular-nums">
                  <strong className="text-lg font-semibold tracking-tight text-[#202329]">{formatCurrency(quote.price, quote.currency)}</strong>
                  <span className={`text-xs ${quote.changePercent >= 0 ? "text-[#16856b]" : "text-[#d65353]"}`}>{formatPercent(quote.changePercent)}</span>
                </div>
                <QuoteStatus quote={quote} failed={failedSymbols.includes(stock.symbol)} />
              </> : <p className="mt-4 py-5 text-xs text-[#727680]">{loading ? "시세 불러오는 중…" : "시세를 확인하지 못했어요"}</p>}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
