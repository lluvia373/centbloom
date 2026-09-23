"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { notificationRepository, type NotificationItem, type VisitWindow } from "./repository";

interface Inbox {
  items: NotificationItem[]; window: VisitWindow|null; ready:boolean; error:string|null; pending:boolean; more:boolean;
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
  const scope=useRef<AbortController|null>(null),visit=useRef<string|null>(null),busy=useRef(false);
  const load=useCallback(async(signal:AbortSignal,before?:NotificationItem)=>{
    if(signal.aborted||busy.current)return;
    busy.current=true;setPending(true);setError(null);
    try{
      const repo=notificationRepository(userId,signal);
      visit.current??=crypto.randomUUID();
      if(!before){const result=await repo.visit(visit.current);if(signal.aborted)return;setWindow(result);}
      const rows=await repo.list(before);
      if(!signal.aborted){setItems(current=>before?[...current,...rows.filter(r=>!current.some(c=>c.event_id===r.event_id))]:rows);setMore(rows.length===50);setReady(true);}
    }catch(e){if(!signal.aborted)setError(e instanceof Error?e.message:"알림 조회 실패");}
    finally{if(scope.current?.signal===signal){busy.current=false;if(!signal.aborted)setPending(false);}}
  },[userId]);
  useEffect(()=>{const controller=new AbortController();scope.current=controller;void load(controller.signal);return()=>{controller.abort();busy.current=false;};},[load]);
  const markRead=useCallback(async(item:NotificationItem)=>{
    const signal=scope.current?.signal;if(!signal||signal.aborted||busy.current)return;
    busy.current=true;setPending(true);setError(null);
    try{await notificationRepository(userId,signal).markRead(item.event_id);if(!signal.aborted)setItems(current=>current.map(row=>row.event_id===item.event_id?{...row,read_at:new Date().toISOString()}:row));}
    catch(e){if(!signal.aborted)setError(e instanceof Error?e.message:"읽음 저장 실패");}
    finally{if(scope.current?.signal===signal){busy.current=false;if(!signal.aborted)setPending(false);}}
  },[userId]);
  useEffect(()=>{
    publish({account,inbox:{items,window,ready,error,pending,more,
      reload:()=>{if(scope.current)void load(scope.current.signal);},
      next:()=>{if(scope.current)void load(scope.current.signal,items.at(-1));},
      markRead:(item)=>void markRead(item)}});
  },[account,publish,items,window,ready,error,pending,more,load,markRead]);
  return null;
}
