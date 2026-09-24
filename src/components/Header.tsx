"use client";
import { primaryNavigation, navigationArea } from "@/features/navigation";
import { BrandMark } from "@/components/BrandMark";
import { StockDiscovery } from "@/features/home/StockDiscovery";
import { HeaderAccountControls } from "@/features/navigation/HeaderAccountControls";
import marketHeader from "@/features/market/MarketHeader.module.css";
import { usePreferences } from "@/hooks/usePortfolio";
import { LayoutDashboard, Plus, Wallet, Landmark } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
const icons = { market: LayoutDashboard, investment: Wallet, gurus: Landmark };
const links = primaryNavigation.map((item) => ({ ...item, icon: icons[item.area] }));
export function Header() {
  const pathname = usePathname();
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
          {links.map(({ href, label, area: linkArea, icon: Icon }) => (
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
      </aside>
      <header className={marketHeader.header} aria-label="종목 검색과 계정">
        <div className={marketHeader.search}>
          <StockDiscovery key={pathname} compact />
          <HeaderAccountControls key={`account-${pathname}`} />
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
  titleAction,
  children,
}: {
  title: string;
  titleAction?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div className="page-heading-title">
        <h1>{title}</h1>
        {titleAction}
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
