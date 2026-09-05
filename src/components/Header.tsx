"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownUp,
  ArrowUpRight,
  Bell,
  BookOpen,
  ChartNoAxesCombined,
  ChevronRight,
  CircleHelp,
  LayoutDashboard,
  Leaf,
  LogOut,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Wallet,
  Star,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useWorkspace } from "@/hooks/useWorkspace";
const links = [
  { href: "/", label: "대시보드", icon: LayoutDashboard },
  { href: "/portfolio", label: "내 포트폴리오", icon: Wallet },
  { href: "/insights", label: "성과 분석", icon: ChartNoAxesCombined },
  { href: "/watchlist", label: "관심종목", icon: Star },
  { href: "/journal", label: "투자 노트", icon: BookOpen },
];
export function Header() {
  const pathname = usePathname();
  const { user, configured, signOut } = useAuth();
  const {
    displayCurrency,
    setDisplayCurrency,
    lastMarketUpdateAt,
    marketDataError,
  } = usePortfolio();
  const { isDemo, setDemo } = useWorkspace();
  const [panel, setPanel] = useState<"notifications" | "help" | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pageName =
    links.find((item) => item.href === pathname)?.label ??
    (pathname === "/settings"
      ? "설정"
      : pathname === "/search"
        ? "거래 기록"
        : "종목 살펴보기");
  const samplePage = ["/", "/portfolio", "/insights"].includes(pathname);
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
        <Link href="/" className="brand" aria-label="Stockfolio 홈">
          <span className="brand-symbol">
            <i />
            <i />
            <i />
          </span>
          <span>
            stockfolio<span className="brand-period">.</span>
          </span>
        </Link>
        <div className="workspace-selector">
          <span className="workspace-icon">
            <Leaf size={17} />
          </span>
          <span>
            <strong>나의 투자 공간</strong>
            <small>Personal workspace</small>
          </span>
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav className="sidebar-nav" aria-label="주요 메뉴">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={pathname === href ? "active" : ""}
              aria-current={pathname === href ? "page" : undefined}
            >
              <Icon size={18} strokeWidth={1.7} />
              <span>{label}</span>
              {pathname === href && <span className="nav-dot" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-divider" />
        <nav className="sidebar-nav" aria-label="도구">
          <Link
            href="/search"
            onClick={() => setDemo(false)}
            className={pathname === "/search" ? "active" : ""}
          >
            <ArrowDownUp size={18} strokeWidth={1.7} />
            <span>거래 기록</span>
          </Link>
          <Link
            href="/settings"
            className={pathname === "/settings" ? "active" : ""}
          >
            <Settings2 size={18} strokeWidth={1.7} />
            <span>설정 및 데이터</span>
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <div className="sidebar-note-art">
              <span />
              <span />
              <span />
              <Leaf size={22} />
            </div>
            <p>
              좋은 투자는
              <br />
              <strong>나를 아는 것부터.</strong>
            </p>
            <Link href="/journal">
              오늘의 생각 기록하기 <ArrowUpRight size={14} />
            </Link>
          </div>
          <Link className="profile" href="/settings">
            <span className="profile-avatar">
              {user?.email?.slice(0, 1).toUpperCase() ?? "S"}
            </span>
            <span>
              <strong>
                {user?.user_metadata?.full_name ?? "나의 포트폴리오"}
              </strong>
              <small>{user ? "개인 계정" : "로컬 워크스페이스"}</small>
            </span>
            <ChevronRight size={15} />
          </Link>
        </div>
      </aside>
      <header className="topbar">
        <div className="breadcrumbs">
          <span>나의 투자 공간</span>
          <ChevronRight size={13} />
          <strong>{pageName}</strong>
        </div>
        <Link href="/" className="mobile-brand">
          <span className="brand-symbol">
            <i />
            <i />
            <i />
          </span>
          stockfolio.
        </Link>
        <div className="topbar-actions" ref={panelRef}>
          <Link
            href="/search"
            className="topbar-search"
            onClick={() => setDemo(false)}
          >
            <Search size={16} />
            <span>종목 찾아보기</span>
            <span className="search-shortcut">↗</span>
          </Link>
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
          <button
            className="icon-button"
            aria-label="업데이트 상태"
            aria-expanded={panel === "notifications"}
            onClick={() =>
              setPanel(panel === "notifications" ? null : "notifications")
            }
          >
            <Bell size={18} />
            <span className="notification-dot" />
          </button>
          <button
            className="icon-button help-button"
            aria-label="앱 사용 안내"
            aria-expanded={panel === "help"}
            onClick={() => setPanel(panel === "help" ? null : "help")}
          >
            <CircleHelp size={18} />
          </button>
          {panel === "notifications" && (
            <div className="topbar-popover">
              <h3>
                업데이트 상태{" "}
                <button aria-label="닫기" onClick={() => setPanel(null)}>
                  <X size={15} />
                </button>
              </h3>
              <p>
                {isDemo && samplePage
                  ? "지금 보고 있는 자산과 시세는 체험용 샘플입니다."
                  : (marketDataError ??
                    (lastMarketUpdateAt
                      ? `마지막 시세 확인: ${new Date(lastMarketUpdateAt).toLocaleTimeString("ko-KR")}`
                      : "거래를 기록하면 보유종목 시세를 확인합니다."))}
              </p>
              <small>
                관심종목 목표가는 관심종목 화면에서 확인할 수 있습니다.
              </small>
            </div>
          )}
          {panel === "help" && (
            <div className="topbar-popover">
              <h3>
                Stockfolio 사용 안내{" "}
                <button aria-label="닫기" onClick={() => setPanel(null)}>
                  <X size={15} />
                </button>
              </h3>
              <p>
                거래를 기록하고, 자산의 흐름을 살펴보세요. 관심종목에는
                목표가를, 투자 노트에는 선택의 이유를 남길 수 있습니다.
              </p>
              <Link href="/settings" onClick={() => setPanel(null)}>
                데이터 백업 및 설정 <ArrowUpRight size={14} />
              </Link>
            </div>
          )}
          {configured && user && (
            <button
              className="icon-button"
              aria-label="로그아웃"
              onClick={() => void signOut()}
            >
              <LogOut size={17} />
            </button>
          )}
        </div>
      </header>
      <nav className="mobile-nav" aria-label="모바일 메뉴">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={pathname === href ? "active" : ""}
            aria-current={pathname === href ? "page" : undefined}
          >
            <Icon size={20} />
            <span>
              {label === "내 포트폴리오"
                ? "자산"
                : label === "대시보드"
                  ? "홈"
                  : label === "성과 분석"
                    ? "분석"
                    : label}
            </span>
          </Link>
        ))}
      </nav>
    </>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      <div className="page-heading-actions">{children}</div>
    </div>
  );
}
export function PortfolioMode() {
  const { isDemo, setDemo } = useWorkspace();
  return (
    <div className={`portfolio-mode ${isDemo ? "sample" : "personal"}`}>
      <div>
        <span className="mode-icon">
          {isDemo ? <Sparkles size={15} /> : <Wallet size={15} />}
        </span>
        <strong>{isDemo ? "샘플 포트폴리오" : "내 포트폴리오"}</strong>
        <span>
          {isDemo
            ? "예시 데이터로 나의 새로운 투자 공간을 둘러보세요."
            : "나의 거래 기록을 바탕으로 보여드려요."}
        </span>
      </div>
      <button onClick={() => setDemo(!isDemo)}>
        {isDemo ? "내 포트폴리오 시작하기" : "샘플 둘러보기"}
        <ArrowUpRight size={14} />
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
