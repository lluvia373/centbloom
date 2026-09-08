"use client";
import { primaryNavigation, navigationArea } from "@/features/navigation";
import { BrandMark } from "@/components/BrandMark";
import { MarketTicker } from "@/features/market/MarketTicker";
import { StockDiscovery } from "@/features/home/StockDiscovery";
import marketHeader from "@/features/market/MarketHeader.module.css";
import { useAuth } from "@/hooks/useAuth";
import { usePreferences } from "@/hooks/usePortfolio";
import { ChevronRight, LayoutDashboard, Plus, Settings2, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
const icons = { market: LayoutDashboard, investment: Wallet, settings: Settings2 };
const links = primaryNavigation.map((item) => ({ ...item, icon: icons[item.area] }));
export function Header() {
  const pathname = usePathname();
  const { user, configured } = useAuth();
  const area = navigationArea(pathname);
  return (
    <>
      <a href="#main-content" className="skip-link">
        본문으로 건너뛰기
      </a>
      <aside className="sidebar">
        <Link href="/" className="brand" aria-label="Centbloom 홈">
          <BrandMark size={44} />
          <span>centbloom</span>
        </Link>
        <nav className="sidebar-nav" aria-label="주요 메뉴">
          {links.filter((item) => item.area !== "settings").map(({ href, label, area: linkArea, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={area === linkArea ? "active" : ""}
              aria-current={area === linkArea ? "page" : undefined}
            >
              <Icon size={18} strokeWidth={1.7} />
              <span>{label}</span>
              {area === linkArea && <span className="nav-dot" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-account">
          <nav className="sidebar-nav" aria-label="계정 메뉴">
            {links.filter((item) => item.area === "settings").map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className={area === "settings" ? "active" : ""}
                aria-current={area === "settings" ? "page" : undefined}>
                <Icon size={18} strokeWidth={1.7} />
                <span>{label}</span>
                {area === "settings" && <span className="nav-dot" />}
              </Link>
            ))}
          </nav>
        </div>
        <div className="sidebar-bottom">
          <Link className="profile" href="/settings" aria-label="계정 설정">
            <span className="profile-avatar">{user?.email?.slice(0, 1).toUpperCase() ?? "C"}</span>
            <span>
              <strong>{user?.user_metadata?.full_name ?? "나의 포트폴리오"}</strong>
              <small>{user ? "개인 계정" : "로컬 워크스페이스"}</small>
            </span>
            <ChevronRight size={15} />
          </Link>
        </div>
      </aside>
      <header className={marketHeader.header} aria-label="시장 지수와 종목 검색">
        <div className={marketHeader.ticker}><MarketTicker /></div>
        <div className={marketHeader.search}>
          <StockDiscovery key={pathname} />
          {configured && !user && <Link href="/portfolio" className={marketHeader.login}>로그인</Link>}
        </div>
      </header>
      <nav className="mobile-nav" aria-label="모바일 메뉴">
        {links.map(({ href, label, area: linkArea, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={area === linkArea ? "active" : ""}
            aria-current={area === linkArea ? "page" : undefined}
          >
            <Icon size={20} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
export function PageHeading({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
      </div>
      {children && <div className="page-heading-actions">{children}</div>}
    </div>
  );
}
export function AddTransactionLink() {
  return (
    <Link
      href="/search"
      className="button-primary"
    >
      <Plus size={16} />
      거래 기록하기
    </Link>
  );
}

export function CurrencySwitch() {
  const { displayCurrency, setDisplayCurrency } = usePreferences();
  return (
<div className="currency-switch" role="group" aria-label="표시 통화">
            {(["KRW", "USD"] as const).map((currency) => (
              <button
                key={currency}
                onClick={() => setDisplayCurrency(currency)}
                aria-pressed={displayCurrency === currency}
                className={displayCurrency === currency ? "selected" : ""}
              >
                {currency}
              </button>
            ))}
          </div>
  );
}
