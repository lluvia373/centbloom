"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { notificationRepository } from "./repository";
import styles from "@/features/gurus/Guru.module.css";

export function FollowGuru({guruId}:{guruId:string}) {
  const {user,loading,configured,signInWithGoogle}=useAuth();
  const [error,setError]=useState<string|null>(null);
  const [connecting,setConnecting]=useState(false);
  const connectingRef=useRef(false);
  if(loading) return <span className={styles.muted}>계정 확인 중</span>;
  if(!user) return <div><button className={styles.control} disabled={!configured||connecting} onClick={async()=>{
    if(connectingRef.current)return;connectingRef.current=true;setConnecting(true);
    try{const result=await signInWithGoogle();setError(result);}finally{connectingRef.current=false;setConnecting(false);}
  }}>{connecting?"로그인 연결 중":"로그인하고 구루 저장"}</button>{error&&<p role="alert" className={styles.error}>{error}</p>}{!configured&&<p className={styles.muted}>계정 연결이 필요합니다.</p>}</div>;
  return <FollowAccount key={`${user.id}:${guruId}`} userId={user.id} guruId={guruId}/>;
}
function FollowAccount({userId,guruId}:{userId:string;guruId:string}) {
  const [active,setActive]=useState<boolean|null>(null),[error,setError]=useState<string|null>(null),[pending,setPending]=useState(false);
  const [retryPending,setRetryPending]=useState(false);
  const scope=useRef<AbortController|null>(null);
  const request=useRef<{id:string;active:boolean}|null>(null);
  const busy=useRef(false);
  const load=useCallback((signal:AbortSignal)=>Promise.resolve()
    .then(()=>notificationRepository(userId,signal).followed(guruId))
    .then(value=>{if(!signal.aborted){setActive(value);setError(null);}})
    .catch(e=>{if(!signal.aborted)setError(e instanceof Error?e.message:"저장 상태 확인 실패");}),[userId,guruId]);
  useEffect(()=>{const controller=new AbortController();scope.current=controller;void load(controller.signal);return()=>controller.abort();},[load]);
  const save=async()=>{
    if(busy.current||active===null||!scope.current)return;
    busy.current=true;setPending(true);setError(null);
    const signal=scope.current.signal;
    request.current??={id:crypto.randomUUID(),active:!active};
    setRetryPending(true);
    try{await notificationRepository(userId,signal).follow(request.current.id,guruId,request.current.active);
      if(!signal.aborted){request.current=null;setRetryPending(false);await load(signal);}}
    catch(e){if(!signal.aborted)setError(e instanceof Error?e.message:"구루 저장 실패");}
    finally{busy.current=false;if(!signal.aborted)setPending(false);}
  };
  return <div><button className={styles.control} disabled={pending||active===null} aria-pressed={active??false} onClick={()=>void save()}>{pending?"저장 중":retryPending?"저장 다시 시도":active?"저장한 구루":"구루 저장"}</button>
    {error&&<p role="alert" className={styles.error}>{error}</p>}
    {error&&active===null&&<button className={styles.control} onClick={()=>scope.current&&void load(scope.current.signal)}>다시 확인</button>}
  </div>;
}
