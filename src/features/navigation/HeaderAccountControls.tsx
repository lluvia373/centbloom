"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bell, LogOut, Settings2, UserRound } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNotificationInbox } from "@/features/notifications/NotificationProvider";
import styles from "./header-account-controls.module.css";

type Auth = ReturnType<typeof useAuth>;
type Inbox = ReturnType<typeof useNotificationInbox>;
type Panel = "notifications" | "account";

export function HeaderAccountControls() {
  const auth = useAuth();
  const inbox = useNotificationInbox();
  if (auth.loading) return <div className={styles.loading} role="status" aria-label="계정 확인 중" />;
  if (auth.configured && !auth.user) return <Link className={styles.login} href="/portfolio">로그인</Link>;
  return <AccountControls key={auth.user?.id ?? "local"} auth={auth} inbox={inbox} />;
}

function AccountControls({ auth, inbox }: { auth: Auth; inbox: Inbox }) {
  const [open, setOpen] = useState<Panel | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actionPending = useRef(false);
  const keyboardOpen = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const accountButton = useRef<HTMLButtonElement>(null);
  const notificationButton = useRef<HTMLButtonElement>(null);
  const id = useId();
  const rawName = auth.user?.user_metadata?.full_name ?? auth.user?.user_metadata?.name;
  const name = typeof rawName === "string" && rawName.trim() ? rawName.trim() : auth.user?.email ?? "내 계정";
  const hasAccount = auth.configured && !!auth.user;
  const notificationLabel = inbox?.hasUnread === true ? "알림, 읽지 않은 알림 있음" : inbox?.unreadError ? "알림, 새 알림 확인 필요" : "알림";

  useEffect(() => {
    if (!open) return;
    if (keyboardOpen.current) panel.current?.querySelector<HTMLElement>("a, button")?.focus();
    const closeOutside = (event: Event) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(null);
      (open === "account" ? accountButton : notificationButton).current?.focus();
    };
    const resize = () => {
      if (open === "notifications" && window.matchMedia("(max-width: 760px)").matches) {
        if (panel.current?.contains(document.activeElement) || document.activeElement === notificationButton.current) {
          root.current?.querySelector<HTMLAnchorElement>('a[href="/notifications"]')?.focus();
        }
        setOpen(null);
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("focusin", closeOutside);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("focusin", closeOutside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", resize);
    };
  }, [open]);

  const toggle = (next: Panel, fromKeyboard: boolean) => {
    keyboardOpen.current = fromKeyboard;
    setOpen(open === next ? null : next);
    if (next === "notifications" && open !== next) inbox?.reload();
  };
  const logout = async () => {
    if (actionPending.current) return;
    actionPending.current = true;
    setPending(true);
    setError(null);
    try { await auth.signOut(); }
    catch { setError("로그아웃하지 못했습니다. 다시 시도해 주세요."); }
    finally { actionPending.current = false; setPending(false); }
  };

  return <div className={styles.controls} ref={root}>
    {hasAccount && <>
      <button type="button" ref={notificationButton} className={`${styles.iconButton} ${styles.desktopBell}`}
        aria-label={notificationLabel} title="알림" aria-expanded={open === "notifications"}
        aria-controls={`${id}-notifications`} aria-haspopup="dialog" onClick={event => toggle("notifications", event.detail === 0)}>
        <Bell size={20} strokeWidth={1.7} aria-hidden="true" />
        {inbox?.hasUnread === true && <span className={styles.unreadDot} aria-hidden="true" />}
      </button>
      <Link className={`${styles.iconButton} ${styles.mobileBell}`} href="/notifications" aria-label={notificationLabel} title="알림"
        onClick={() => { setOpen(null); inbox?.reload(); }}>
        <Bell size={20} strokeWidth={1.7} aria-hidden="true" />
        {inbox?.hasUnread === true && <span className={styles.unreadDot} aria-hidden="true" />}
      </Link>
    </>}
    <button type="button" className={styles.iconButton} ref={accountButton} title="계정 메뉴" aria-label="계정 메뉴"
      aria-haspopup="dialog" aria-expanded={open === "account"} aria-controls={`${id}-account`} onClick={event => toggle("account", event.detail === 0)}>
      <span className={styles.avatar}>{hasAccount ? Array.from(name)[0]?.toUpperCase() : <UserRound size={19} strokeWidth={1.7} aria-hidden="true" />}</span>
    </button>
    {open && <div className={`${styles.panel} ${open === "account" ? styles.accountPanel : ""}`}
      id={`${id}-${open}`} role="dialog" aria-label={open === "account" ? "계정 메뉴" : "최근 알림"} ref={panel}>
      {open === "notifications" ? <NotificationPreview inbox={inbox} onNavigate={() => setOpen(null)} /> : <>
        <div className={styles.accountIdentity}>
          <strong>{hasAccount ? name : "이 브라우저의 기록"}</strong>
          {hasAccount && auth.user?.email && auth.user.email !== name && <span>{auth.user.email}</span>}
        </div>
        <Link className={styles.menuAction} href="/settings" onClick={() => setOpen(null)}><Settings2 size={18} aria-hidden="true" />계정 설정</Link>
        {hasAccount && <button type="button" className={styles.menuAction} onClick={() => void logout()} disabled={pending}>
          <LogOut size={18} aria-hidden="true" />{pending ? "로그아웃 중…" : "로그아웃"}
        </button>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
      </>}
    </div>}
  </div>;
}

function NotificationPreview({ inbox, onNavigate }: { inbox: Inbox; onNavigate: () => void }) {
  const error = inbox?.error ?? inbox?.unreadError;
  return <>
    <div className={styles.panelHeading}><strong>알림</strong><Link href="/notifications" onClick={onNavigate}>전체 보기<ArrowRight size={14} aria-hidden="true" /></Link></div>
    {error && <div className={styles.notice} role="alert"><p>{error}</p><button type="button" onClick={inbox?.reload} disabled={inbox?.pending}>다시 확인</button></div>}
    {(!inbox?.ready || (inbox.pending && !inbox.items.length)) && !error && <p className={styles.empty} role="status">알림 확인 중…</p>}
    {inbox?.ready && !inbox.pending && !inbox.items.length && !error && <p className={styles.empty}>아직 받은 알림이 없어요.</p>}
    {!!inbox?.items.length && <ul className={styles.notificationList}>{inbox.items.slice(0, 5).map(item => <li key={item.event_id}>
      <Link href={item.kind === "watch_change" ? `/stock/${encodeURIComponent(item.subject_id)}` : `/gurus/${encodeURIComponent(item.subject_id)}`} onClick={onNavigate}>
        <span className={styles.notificationTitle}>{item.title}</span>
        <span className={styles.notificationMeta}>{new Date(item.occurred_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })} · {item.read_at ? "읽음" : "읽지 않음"}</span>
      </Link>
      {!item.read_at && <button type="button" className={styles.markRead} onClick={event => {
        // The successful read removes this action; keep keyboard position on its item.
        event.currentTarget.closest("li")?.querySelector("a")?.focus({ preventScroll: true });
        inbox.markRead(item);
      }} disabled={inbox.pending} aria-label={`${item.title} 읽음 표시`}>읽음 표시</button>}
    </li>)}</ul>}
  </>;
}
