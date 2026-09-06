export const primaryNavigation = [
  { href: "/", label: "시장", area: "market" },
  { href: "/portfolio", label: "내 투자", area: "investment" },
  { href: "/settings", label: "설정", area: "settings" },
] as const;

export const investmentNavigation = [
  { href: "/portfolio", label: "보유자산" },
  { href: "/watchlist", label: "관심종목" },
  { href: "/insights", label: "성과 분석" },
  { href: "/journal", label: "투자 노트" },
  { href: "/transactions", label: "거래내역" },
] as const;

export function investmentTab(path: string) {
  const normalized = path.replace(/\/+$/, "") || "/";
  return investmentNavigation.find((item) => item.href === (normalized === "/search" ? "/transactions" : normalized));
}
export function navigationArea(path: string) {
  if (path === "/settings") return "settings";
  return investmentTab(path) ? "investment" : "market";
}
export function navigationPageName(path: string) {
  if (path === "/search") return "거래 기록";
  return investmentTab(path)?.label
    ?? (path.startsWith("/calendar") ? "증시 캘린더"
      : path === "/community" ? "리서치 가이드"
      : path === "/discover" ? "종목 탐색"
      : path.startsWith("/read/") ? "읽을거리"
      : path === "/settings" ? "설정"
      : path === "/" ? "시장" : "종목 살펴보기");
}
