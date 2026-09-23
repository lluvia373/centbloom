"use client";
import Link from "next/link";
import { useNotificationInbox } from "./NotificationProvider";
import styles from "@/features/gurus/Guru.module.css";

export function Notifications(){
  const inbox=useNotificationInbox();
  if(!inbox)return <div className={styles.page}><header className={styles.heading}><h1>알림</h1></header><p className={styles.muted}>알림을 확인하려면 계정 연결이 필요합니다.</p></div>;
  const {items,ready,error,pending,more,reload,next,markRead}=inbox;
  return <div className={styles.page}>
    <header className={styles.heading}><h1>알림</h1><div className={styles.actions}><Link className={styles.control} href="/gurus">구루 포트폴리오</Link><Link className={styles.control} href="/watchlist">관심종목</Link></div></header>
    {error&&<div role="alert"><p className={styles.error}>{error}</p><button className={styles.control} disabled={pending} onClick={reload}>다시 확인</button></div>}
    {!ready&&!error&&<p role="status">알림 확인 중</p>}
    {ready&&items.length===0&&!error&&<p className={styles.muted}>새로 확인된 알림이 없습니다.</p>}
    {items.length>0&&<ul className={`${styles.panel} ${styles.list}`}>{items.map(item=><li className={styles.row} key={item.event_id}>
      <div><Link className={styles.control} href={item.kind==="watch_change"?`/stock/${encodeURIComponent(item.subject_id)}`:`/gurus/${encodeURIComponent(item.subject_id)}`}>{item.title}</Link><p className={styles.muted}>{new Date(item.occurred_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})} KST · {item.read_at?"읽음":"읽지 않음"}</p></div>
      <div className={styles.actions}><a className={styles.control} href={item.source_url}>원문</a>{!item.read_at&&<button className={styles.control} disabled={pending} onClick={()=>markRead(item)}>읽음 표시</button>}</div>
    </li>)}</ul>}
    {more&&<button className={styles.control} disabled={pending} onClick={next}>더 보기</button>}
  </div>;
}
