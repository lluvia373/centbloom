import { rankingPages } from "@/features/market/ranking-pages";

export const primaryNavigation = [
  { href: "/", label: "시장", area: "market" },
  { href: "/portfolio", label: "내 투자", area: "investment" },
  { href: "/gurus", label: "구루 포트폴리오", area: "gurus" },
] as const;

export const investmentNavigation = [
  { href: "/portfolio", label: "보유자산" },
  { href: "/watchlist", label: "관심종목" },
  { href: "/journal", label: "투자 노트" },
  { href: "/transactions", label: "거래내역" },
] as const;

export function investmentTab(path: string) {
  const normalized = path.replace(/\/+$/, "") || "/";
  const destination = normalized === "/search" ? "/transactions"
    : normalized === "/insights" ? "/portfolio" : normalized;
  return investmentNavigation.find((item) => item.href === destination);
}
export function navigationArea(path: string) {
  if (path === "/settings") return "settings";
  if (path === "/gurus" || path.startsWith("/gurus/")) return "gurus";
  return investmentTab(path) ? "investment" : "market";
}
export function navigationPageName(path: string) {
  if (path === "/search") return "거래 기록";
  if (path === "/gurus" || path.startsWith("/gurus/")) return "구루 포트폴리오";
  return investmentTab(path)?.label
    ?? Object.values(rankingPages).find(({ href }) => href === path)?.title
    ?? (path.startsWith("/calendar") ? "증시 캘린더"
      : path === "/community" ? "리서치 가이드"
      : path === "/discover" ? "종목 탐색"
      : path === "/movements" ? "평소와 다른 움직임"
      : path.startsWith("/read/") ? "읽을거리"
      : path === "/settings" ? "계정 설정"
      : path === "/" ? "시장" : "종목 살펴보기");
}
