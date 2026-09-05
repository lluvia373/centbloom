import { Apple, ArrowUpRight } from "lucide-react";

export function AssetAvatar({
  symbol,
  small = false,
}: {
  symbol: string;
  small?: boolean;
}) {
  const style =
    symbol === "NVDA"
      ? "asset-nvidia"
      : symbol === "005930.KS"
        ? "asset-samsung"
        : symbol === "035420.KS"
          ? "asset-naver"
          : symbol === "VOO"
            ? "asset-vanguard"
            : "";
  return (
    <span
      className={`asset-avatar ${style} ${small ? "asset-avatar-small" : ""}`}
      aria-hidden="true"
    >
      {symbol === "AAPL" ? (
        <Apple size={small ? 18 : 23} fill="currentColor" strokeWidth={1.3} />
      ) : symbol === "MSFT" ? (
        <span className="microsoft-mark">
          <i />
          <i />
          <i />
          <i />
        </span>
      ) : symbol === "NVDA" ? (
        <span className="nvidia-mark">N</span>
      ) : symbol === "005930.KS" ? (
        <span className="samsung-mark">S</span>
      ) : symbol === "VOO" ? (
        <span className="vanguard-mark">V</span>
      ) : symbol === "035420.KS" ? (
        "N"
      ) : symbol === "GOOGL" ? (
        <span style={{ color: "#4285f4" }}>G</span>
      ) : (
        symbol.slice(0, 2)
      )}
    </span>
  );
}

export function EmptyPortfolio({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`empty-portfolio ${compact ? "compact" : ""}`}>
      <span className="empty-icon">
        <ArrowUpRight size={27} />
      </span>
      <h3>투자의 첫 페이지를 열어보세요</h3>
      <p>첫 거래를 기록하면 자산과 수익이 한곳에 모입니다.</p>
      <a href="/search" className="button-primary">
        첫 거래 기록하기 <ArrowUpRight size={15} />
      </a>
    </div>
  );
}
