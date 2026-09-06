"use client";

import { useAuth } from "@/hooks/useAuth";
import { CurrencySettings } from "./CurrencySettings";
import { useState } from "react";

export function AccountSettings() {
  const { user, loading, configured, signInWithGoogle, signOut } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = user?.user_metadata?.full_name ?? user?.user_metadata?.name;
  const providers = user?.app_metadata?.providers;
  const joined = user?.created_at ? new Date(user.created_at) : null;
  const fields = [
    ["이름", typeof name === "string" ? name : null],
    ["이메일", user?.email],
    ["로그인 방식", Array.isArray(providers) && providers.includes("google") ? "Google" : null],
    ["가입일", joined && Number.isFinite(joined.getTime()) ? joined.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" }) : null],
  ];

  const handleAccountAction = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      if (user) await signOut();
      else setError(await signInWithGoogle());
    } catch {
      setError(user ? "로그아웃하지 못했습니다. 다시 시도해 주세요." : "로그인하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setPending(false);
    }
  };

  return (
    <section aria-label="계정 정보" className="rounded-cf-card border border-cf-line bg-cf-surface px-4 py-3 sm:px-6">
      {user ? (
        <dl className="divide-y divide-cf-line">
          {fields.filter(([, value]) => value).map(([label, value]) => (
            <div key={label} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 py-3 text-cf-label">
              <dt className="shrink-0 text-cf-muted">{label}</dt>
              <dd className="min-w-0 break-all">{value}</dd>
            </div>
          ))}
        </dl>
      ) : <p className="py-3 text-cf-label">{loading ? "계정 확인 중" : "로그인하지 않음"}</p>}
      <CurrencySettings />
      {configured && (
        <div className="flex justify-end border-t border-cf-line pt-2">
          <button
            type="button"
            onClick={() => void handleAccountAction()}
            disabled={loading || pending}
            className="min-h-8 rounded-cf-control px-2 py-1 text-cf-label text-cf-muted hover:bg-cf-soft hover:text-cf-ink disabled:cursor-wait disabled:opacity-50 pointer-coarse:min-h-11"
          >{pending ? "처리 중" : user ? "로그아웃" : "Google로 로그인"}</button>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-cf-caption text-cf-negative">{error}</p>}
    </section>
  );
}
