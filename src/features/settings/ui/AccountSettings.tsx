"use client";

import { useAuth } from "@/hooks/useAuth";
import { LogOut, UserRound } from "lucide-react";
import { useState } from "react";

export function AccountSettings() {
  const { user, loading, configured, signInWithGoogle, signOut } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAccountAction = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      if (user) {
        await signOut();
      } else {
        setError(await signInWithGoogle());
      }
    } catch {
      setError(
        user
          ? "로그아웃하지 못했습니다. 다시 시도해 주세요."
          : "로그인하지 못했습니다. 다시 시도해 주세요.",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <section
      aria-labelledby="account-settings-title"
      className="rounded-cf-card border border-cf-line bg-cf-surface p-4 sm:p-6"
    >
      <h2 id="account-settings-title" className="text-cf-section font-semibold">
        계정
      </h2>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-cf-pill bg-cf-soft text-cf-muted">
          <UserRound className="h-6 w-6" aria-hidden="true" />
        </span>
        <p className="min-w-0 flex-1 break-all text-cf-body">
          {loading ? "계정 확인 중" : user?.email ?? (user ? "로그인 계정" : "로그인하지 않음")}
        </p>
        {configured && (
          <button
            type="button"
            onClick={() => void handleAccountAction()}
            disabled={loading || pending}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-cf-control border border-cf-line px-3 py-2 text-cf-label font-medium transition-colors hover:bg-cf-soft disabled:cursor-wait disabled:opacity-50"
          >
            {user && <LogOut className="h-4 w-4" aria-hidden="true" />}
            {pending ? "처리 중" : user ? "로그아웃" : "Google로 로그인"}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-4 text-cf-caption text-cf-negative">
          {error}
        </p>
      )}
    </section>
  );
}
