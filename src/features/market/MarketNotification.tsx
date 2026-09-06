"use client";
import { usePortfolioMarket } from "@/hooks/usePortfolio";
import { X } from "lucide-react";

export function MarketNotification({
  setPanel,
}: {
  setPanel: (panel: null) => void;
}) {
  const { lastMarketUpdateAt, marketDataError } = usePortfolioMarket();
  return (
    <div className="topbar-popover">
      <h3>
        업데이트 상태{" "}
        <button aria-label="닫기" onClick={() => setPanel(null)}>
          <X size={15} />
        </button>
      </h3>
      <p>
        {marketDataError ??
            (lastMarketUpdateAt
              ? `마지막 시세 확인: ${new Date(lastMarketUpdateAt).toLocaleTimeString("ko-KR")}`
              : "보유종목 없음")}
      </p>
    </div>
  );
}
