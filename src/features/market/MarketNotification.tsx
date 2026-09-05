"use client";
import { usePortfolioMarket } from "@/hooks/usePortfolio";
import { X } from "lucide-react";

export function MarketNotification({
  isDemo,
  samplePage,
  setPanel,
}: {
  isDemo: boolean;
  samplePage: boolean;
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
        {isDemo && samplePage
          ? "포트폴리오 자산은 체험용 샘플입니다. 대시보드의 세계 주식은 실제 시장 시세입니다."
          : (marketDataError ??
            (lastMarketUpdateAt
              ? `마지막 시세 확인: ${new Date(lastMarketUpdateAt).toLocaleTimeString("ko-KR")}`
              : "거래를 기록하면 보유종목 시세를 확인합니다."))}
      </p>
      <small>관심종목 목표가는 관심종목 화면에서 확인할 수 있습니다.</small>
    </div>
  );
}
