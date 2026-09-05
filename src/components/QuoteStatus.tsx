import type { StockQuote } from "@/lib/types";

export function QuoteStatus({ quote, failed = false }: { quote: StockQuote; failed?: boolean }) {
  const timestamp = quote.quotedAt ? Date.parse(quote.quotedAt) : NaN;
  const time = Number.isFinite(timestamp) ? new Intl.DateTimeFormat("ko-KR", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
    hour12: false, timeZone: "Asia/Seoul",
  }).format(timestamp) : "시각 미제공";
  const session = quote.marketState === "REGULAR" ? "정규장" : quote.marketState === "CLOSED" ? "장 마감" : "정규장 가격";
  const delay = quote.delayMinutes ? `${quote.delayMinutes}분 지연`
    : /real\s*time/i.test(quote.source ?? "") ? "실시간 제공" : "지연 가능";
  return (
    <p className={`mt-2 text-[11px] leading-5 ${failed ? "text-[#b46926]" : "text-[#727680]"}`}>
      {failed ? "갱신 실패 · 이전 가격 · " : ""}{session} · {delay}<br />
      {time} KST 기준
    </p>
  );
}
