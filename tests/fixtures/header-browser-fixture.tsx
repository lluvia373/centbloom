// Isolated browser QA only. The production control and CSS are reused; all
// account/event values and actions below stay in memory on the QA origin.
import React, { createContext, useContext, useState } from "react";
import { createRoot } from "react-dom/client";
import { Search } from "lucide-react";
import { HeaderAccountControls } from "../../src/features/navigation/HeaderAccountControls";
import headerStyles from "../../src/features/market/MarketHeader.module.css";
import "../../src/styles/design-tokens.css";

type Mode = "unread" | "guest" | "loading" | "empty" | "read" | "fail" | "long" | "read-error" | "logout-error" | "local";
type Item = { event_id: string; kind: "watch_change" | "guru_filing"; subject_id: string; title: string; occurred_at: string; delivered_at: string; read_at: string | null; source_url: string };
type Auth = { configured: boolean; loading: boolean; user: { id: string; email: string; user_metadata: { full_name: string } } | null; signOut: () => Promise<void> };
type Inbox = { items: Item[]; ready: boolean; error: string | null; unreadError: string | null; pending: boolean; hasUnread: boolean | null; reload: () => void; markRead: (item: Item) => void };
const AuthContext = createContext<Auth | null>(null);
const InboxContext = createContext<Inbox | null>(null);
const NavigationContext = createContext<(path: string) => void>(() => {});
export function useAuth() { return useContext(AuthContext)!; }
export function useNotificationInbox() { return useContext(InboxContext); }
export default function FixtureLink({ href, onClick, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const navigate = useContext(NavigationContext);
  return <a {...props} href={href} onClick={event => { onClick?.(event); event.preventDefault(); navigate(href ?? ""); }}>{children}</a>;
}

const eventTitles = ["관심종목의 새 공시가 확인됐어요", "저장한 구루의 분기 보고서가 공개됐어요", "관심종목의 실적 발표 일정이 바뀌었어요", "저장한 구루의 정정 공시가 공개됐어요", "관심종목의 배당 일정이 확인됐어요", "목록 제한 확인용 여섯 번째 알림"];
function itemsFor(mode: Mode): Item[] {
  if (mode === "empty" || mode === "fail") return [];
  return eventTitles.map((title, index) => ({ event_id: `qa-event-${index}`, kind: index % 2 ? "guru_filing" : "watch_change", subject_id: `qa-subject-${index}`, title: mode === "long" && index === 0 ? "긴 이름을 가진 관심종목에 대해 확인된 새 공시 내용과 여러 단어를 포함한 알림 제목을 표시하는 격리 검사" : title, occurred_at: "2026-09-23T06:12:00Z", delivered_at: "2026-09-23T06:12:00Z", read_at: mode === "read" ? "2026-09-23T06:20:00Z" : null, source_url: "https://example.test/isolated-qa" }));
}

function Scenario({ mode, setMode, report }: { mode: Mode; setMode: (mode: Mode) => void; report: (message: string) => void }) {
  const [items, setItems] = useState(() => itemsFor(mode));
  const [error, setError] = useState<string | null>(mode === "fail" ? "알림 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요." : null);
  const auth: Auth = {
    configured: mode !== "local", loading: mode === "loading",
    user: mode === "guest" || mode === "loading" || mode === "local" ? null : { id: `isolated-${mode}`, email: mode === "long" ? "very-long-identity-for-header-overflow-check@example.test" : "header-review@example.test", user_metadata: { full_name: mode === "long" ? "긴 계정 이름과 여러 단어를 표시하는 격리 검증 사용자" : "검증 계정" } },
    signOut: async () => { if (mode === "logout-error") { report("모의 로그아웃 실패: 실제 계정에는 영향이 없습니다."); throw new Error("isolated logout failure"); } report("모의 로그아웃 완료: 실제 계정에는 영향이 없습니다."); setMode("guest"); },
  };
  const inbox: Inbox = { items, ready: true, error, unreadError: mode === "fail" ? "새 알림 여부를 확인하지 못했습니다." : null, pending: false, hasUnread: mode === "fail" ? null : items.some(item => !item.read_at),
    reload: () => report("모의 알림 재조회: 외부 요청은 없습니다."),
    markRead: item => { if (mode === "read-error") { setError("읽음 상태를 저장하지 못했습니다. 다시 시도해 주세요."); report("모의 읽음 저장 실패"); return; } setItems(current => current.map(row => row.event_id === item.event_id ? { ...row, read_at: "2026-09-23T06:25:00Z" } : row)); report("모의 읽음 표시 완료: 메모리 안에서만 변경했습니다."); },
  };
  return <AuthContext.Provider value={auth}><InboxContext.Provider value={inbox}><NavigationContext.Provider value={path => report(`격리 링크 확인: ${path}`)}>
    <header className={headerStyles.header} aria-label="종목 검색과 계정"><div className={headerStyles.search}>
      <div className="qa-search"><Search size={18} aria-hidden="true" /><input aria-label="종목명 또는 티커 검색" placeholder="종목명·티커 검색" /></div>
      <HeaderAccountControls />
    </div></header>
  </NavigationContext.Provider></InboxContext.Provider></AuthContext.Provider>;
}

function Fixture() {
  const [mode, setMode] = useState<Mode>("unread");
  const [lastAction, report] = useState("검사 조작 대기 중");
  return <>
    <div className="qa-banner"><strong>격리 UI 검증</strong><span>실제 계정·알림·서버와 연결되지 않은 모의 상태입니다.</span></div>
    <aside className="qa-sidebar" aria-hidden="true"><strong>centbloom</strong><span>시장</span><span>내 투자</span></aside>
    <Scenario key={mode} mode={mode} setMode={setMode} report={report} />
    <main className="qa-main"><section className="qa-card"><h1>우상단 조작 확인</h1>
      <label className="qa-state">검증 상태<select value={mode} onChange={event => { setMode(event.target.value as Mode); report("검증 상태를 변경했습니다."); }}>
        <option value="unread">로그인 · 읽지 않은 알림</option><option value="guest">비회원</option><option value="loading">계정 확인 중</option><option value="empty">빈 알림함</option><option value="read">모두 읽음</option><option value="fail">조회 실패</option><option value="long">긴 이름 · 긴 제목</option><option value="read-error">읽음 저장 실패</option><option value="logout-error">로그아웃 실패</option><option value="local">인증 미설정 로컬</option>
      </select></label><p role="status" className="qa-action">{lastAction}</p><p>실제 제품의 계정 버튼·알림 패널·스타일을 그대로 사용합니다. 검색과 주변 영역은 배치 확인용이며, 링크는 이 화면 안에서 목적지만 알려줍니다.</p>
    </section></main>
  </>;
}

createRoot(document.getElementById("root")!).render(<Fixture />);
