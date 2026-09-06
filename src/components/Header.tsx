"use client";
import { primaryNavigation, navigationArea, navigationPageName } from "@/features/navigation";
import { BrandMark } from "@/components/BrandMark";
import { MarketNotification } from "@/features/market/MarketNotification";
import { MarketTicker } from "@/features/market/MarketTicker";
import marketHeader from "@/features/market/MarketHeader.module.css";
import { isPublicRoute } from "@/features/auth/public-routes";

import { useAuth } from "@/hooks/useAuth";
import { usePreferences } from "@/hooks/usePortfolio";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
Bell,
ChevronRight,
CircleHelp,
Layers3,
LayoutDashboard,
LogOut,
Plus,
Search,
Settings2,
Wallet,
X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect,useRef,useState } from "react";
const icons = { market: LayoutDashboard, investment: Wallet, settings: Settings2 };
const links = primaryNavigation.map((item) => ({ ...item, icon: icons[item.area] }));
export function Header() {
  const pathname = usePathname();
  const publicPage = isPublicRoute(pathname);
  const marketHome = pathname === "/";
  const { user, configured, signOut } = useAuth();
  const showActions = !marketHome || (configured && !user);

  const { isDemo, setDemo } = useWorkspace();
  const [panel, setPanel] = useState<"notifications" | "help" | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const area = navigationArea(pathname);
  const pageName = navigationPageName(pathname);
  const samplePage = ["/portfolio", "/insights", "/transactions"].includes(pathname);
  useEffect(() => {
    if (!panel) return;
    const close = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setPanel(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPanel(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [panel]);
  return (
    <>
      <a href="#main-content" className="skip-link">
        본문으로 건너뛰기
      </a>
      <aside className="sidebar">
        <Link href="/" className="brand" aria-label="Centifolio 홈">
          <BrandMark size={44} />
          <span>centifolio</span>
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
      {pathname !== "/portfolio" && <header className={`topbar ${marketHome ? marketHeader.header + (showActions ? "" : " " + marketHeader.quotesOnly) : ""}`}>
        {marketHome ? <MarketTicker /> : <div className="breadcrumbs">
          <span>{area === "investment" ? "내 투자" : "centifolio"}</span>
          <ChevronRight size={13} />
          <strong>{pageName}</strong>
        </div>}
        <Link href="/" className="mobile-brand" aria-label="Centifolio 홈">
          <BrandMark size={36} />
          <span>centifolio</span>
        </Link>
        {showActions && <div className="topbar-actions" ref={panelRef}>
          {!marketHome && <Link
            href="/discover"
            aria-label="종목 검색"
            className="topbar-search"
            onClick={() => setDemo(false)}
          >
            <Search size={16} />
            <span>종목 검색</span>
          </Link>}
          {!publicPage && <CurrencySwitch />}

          {!marketHome && <button
            className="icon-button"
            aria-label="업데이트 상태"
            aria-expanded={panel === "notifications"}
            onClick={() =>
              setPanel(panel === "notifications" ? null : "notifications")
            }
          >
            <Bell size={18} />
            <span className="notification-dot" />
          </button>}
          {!marketHome && <button
            className="icon-button help-button"
            aria-label="앱 사용 안내"
            aria-expanded={panel === "help"}
            onClick={() => setPanel(panel === "help" ? null : "help")}
          >
            <CircleHelp size={18} />
          </button>}
          {!marketHome && panel === "notifications" && (
            <MarketNotification isDemo={isDemo} samplePage={samplePage} setPanel={setPanel} />
          )}
          {!marketHome && panel === "help" && (
            <div className="topbar-popover">
              <h3>
                Centifolio 사용 안내{" "}
                <button aria-label="닫기" onClick={() => setPanel(null)}>
                  <X size={15} />
                </button>
              </h3>
              <p>
                거래를 기록하고, 자산의 흐름을 살펴보세요. 관심종목에는
                목표가를, 투자 노트에는 선택의 이유를 남길 수 있습니다.
              </p>
              <Link href="/settings" onClick={() => setPanel(null)}>
                데이터 백업 및 설정
              </Link>
            </div>
          )}
          {configured && !user && <Link href="/portfolio" className="button-secondary">로그인</Link>}
          {!marketHome && configured && user && (
            <button
              className="icon-button"
              aria-label="로그아웃"
              onClick={() => void signOut()}
            >
              <LogOut size={17} />
            </button>
          )}
        </div>}
      </header>}
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
export function PortfolioMode() {
  const { isDemo, setDemo } = useWorkspace();
  return (
    <div className={`portfolio-mode ${isDemo ? "sample" : "personal"}`}>
      <div>
        <span className="mode-icon">
          {isDemo ? <Layers3 size={15} /> : <Wallet size={15} />}
        </span>
        <strong>{isDemo ? "샘플 포트폴리오" : "내 포트폴리오"}</strong>
      </div>
      <button onClick={() => setDemo(!isDemo)}>
        {isDemo ? "내 포트폴리오 시작하기" : "샘플 둘러보기"}
      </button>
    </div>
  );
}
export function AddTransactionLink() {
  const { setDemo } = useWorkspace();
  return (
    <Link
      href="/search"
      onClick={() => setDemo(false)}
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
