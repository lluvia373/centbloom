"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { notificationRepository, type NotificationItem, type VisitWindow } from "./repository";

interface Inbox {
  items: NotificationItem[]; window: VisitWindow|null; ready:boolean; error:string|null; pending:boolean; more:boolean;
  hasUnread:boolean|null; unreadError:string|null;
  reload:()=>void; next:()=>void; markRead:(item:NotificationItem)=>void;
}
const Context=createContext<Inbox|null>(null);
interface AccountScope { userId: string }
interface InboxSnapshot { account: AccountScope; inbox: Inbox }
/** One account-owned visit window. Mounting another view does not advance the baseline. */
export function NotificationProvider({children}:{children:React.ReactNode}){
  const {user,loading,configured}=useAuth();
  const userId=!loading&&configured?user?.id??null:null;
  const account=useMemo(()=>userId?{userId}:null,[userId]);
  const [snapshot,setSnapshot]=useState<InboxSnapshot|null>(null);
  // Keep the page subtree in the same slot; only the account-owned worker remounts.
  // Scope identity also hides an earlier A session during a rapid A → B → A switch.
  return <Context.Provider value={account&&snapshot?.account===account?snapshot.inbox:null}>
    {children}
    {account?<AccountInbox key={account.userId} account={account} publish={setSnapshot}/>:null}
  </Context.Provider>;
}
export function useNotificationInbox(){return useContext(Context);}
function AccountInbox({account,publish}:{account:AccountScope;publish:(snapshot:InboxSnapshot)=>void}){
  const {userId}=account;
  const [items,setItems]=useState<NotificationItem[]>([]),[window,setWindow]=useState<VisitWindow|null>(null);
  const [ready,setReady]=useState(false),[error,setError]=useState<string|null>(null),[pending,setPending]=useState(false),[more,setMore]=useState(false);
  const [hasUnread,setHasUnread]=useState<boolean|null>(null),[unreadError,setUnreadError]=useState<string|null>(null);
  const scope=useRef<AbortController|null>(null),visit=useRef<string|null>(null),busy=useRef(false),loaded=useRef(false);
  const readIds=useRef(new Set<string>());
  const refreshUnread=useCallback(async(repo:ReturnType<typeof notificationRepository>,signal:AbortSignal)=>{
    try{
      const result=await repo.hasUnread();
      if(!signal.aborted){setHasUnread(result);setUnreadError(null);}
    }catch(e){
      if(!signal.aborted){setHasUnread(null);setUnreadError(e instanceof Error?e.message:"새 알림 여부를 확인하지 못했습니다.");}
    }
  },[]);
  const load=useCallback(async(signal:AbortSignal,before?:NotificationItem)=>{
    if(signal.aborted||busy.current)return;
    busy.current=true;setPending(true);setError(null);
    let initialRead:Promise<unknown>|null=null;
    try{
      const repo=notificationRepository(userId,signal);
      visit.current??=crypto.randomUUID();
      const readRows=async()=>{
        const rows=await repo.list(before);
        if(!signal.aborted){
          for(const row of rows)if(row.read_at)readIds.current.add(row.event_id);
          setItems(current=>before?[...current,...rows.filter(r=>!current.some(c=>c.event_id===r.event_id))]:rows);
          setMore(rows.length===50);setReady(true);loaded.current=true;
        }
      };
      if(before){await readRows();return;}
      // Show already delivered rows without waiting for visit synchronization.
      // Only the first load needs this early read; reloads retain the visible rows.
      initialRead=!loaded.current?Promise.allSettled([readRows(),refreshUnread(repo,signal)]):null;
      const result=await repo.visit(visit.current);
      if(signal.aborted)return;
      setWindow(result);
      if(initialRead)await initialRead;
      if(signal.aborted)return;
      // visit_notifications delivers new events. Re-read AFTER its commit, not
      // merely in parallel, or a newly delivered event would be missed.
      const [rowsResult]=await Promise.allSettled([readRows(),refreshUnread(repo,signal)]);
      if(rowsResult.status==="rejected")throw rowsResult.reason;
    }catch(e){
      if(initialRead)await initialRead;
      if(!signal.aborted){setError(e instanceof Error?e.message:"알림 조회 실패");if(!before)setHasUnread(null);}
    }
    finally{if(initialRead)await initialRead;if(scope.current?.signal===signal){busy.current=false;if(!signal.aborted)setPending(false);}}
  },[userId,refreshUnread]);
  useEffect(()=>{const controller=new AbortController();scope.current=controller;void load(controller.signal);return()=>{controller.abort();busy.current=false;};},[load]);
  useEffect(()=>{
    if(typeof document==="undefined")return;
    const refresh=()=>{if(document.visibilityState==="visible"&&scope.current)void load(scope.current.signal);};
    document.addEventListener("visibilitychange",refresh);
    return()=>document.removeEventListener("visibilitychange",refresh);
  },[load]);
  const markRead=useCallback(async(item:NotificationItem)=>{
    const signal=scope.current?.signal;if(!signal||signal.aborted||busy.current||item.read_at||readIds.current.has(item.event_id))return;
    busy.current=true;setPending(true);setError(null);
    try{
      const repo=notificationRepository(userId,signal);
      await repo.markRead(item.event_id);
      if(signal.aborted)return;
      readIds.current.add(item.event_id);
      setItems(current=>current.map(row=>row.event_id===item.event_id?{...row,read_at:new Date().toISOString()}:row));
      await refreshUnread(repo,signal);
    }
    catch(e){if(!signal.aborted)setError(e instanceof Error?e.message:"읽음 저장 실패");}
    finally{if(scope.current?.signal===signal){busy.current=false;if(!signal.aborted)setPending(false);}}
  },[userId,refreshUnread]);
  useEffect(()=>{
    publish({account,inbox:{items,window,ready,error,pending,more,hasUnread,unreadError,
      reload:()=>{if(scope.current)void load(scope.current.signal);},
      next:()=>{if(scope.current)void load(scope.current.signal,items.at(-1));},
      markRead:(item)=>void markRead(item)}});
  },[account,publish,items,window,ready,error,pending,more,hasUnread,unreadError,load,markRead]);
  return null;
}
