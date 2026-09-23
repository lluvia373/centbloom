"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import { cancelLoginReturn, failedReturnPath, startLoginReturn, takeLoginReturn } from "@/features/auth/login-return";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  configured: boolean;
  loginError: string | null;
  signInWithGoogle: () => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const configured = isSupabaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(configured);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let mounted = true;
    // Read the external OAuth callback after mounting; discard the Strict Mode trial effect.
    void Promise.resolve().then(() => {
    if (!mounted) return;
    const query = new URLSearchParams(window.location.search);
    const failure = new URLSearchParams(window.location.hash.slice(1)).has("error") || query.has("error") || query.get("auth_result") === "failed";
    if (!failure && (loading || !user)) return;
    try {
      const target = takeLoginReturn(window.sessionStorage);
      if (failure) setLoginError("로그인이 취소되었거나 완료되지 않았습니다. 다시 로그인해 주세요.");
      if (target) window.location.replace(failure ? failedReturnPath(target) : target);
      else if (failure) {
        query.delete("auth_result"); query.delete("error"); query.delete("error_description"); query.delete("error_code");
        window.history.replaceState(null,"",window.location.pathname + (query.size ? `?${query}` : ""));
      }
    } catch {
      setLoginError("이전 작업을 복원하지 못했습니다. 종목을 다시 선택해 주세요.");
    }
    });
    return () => { mounted = false; };
  }, [loading, user]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return;
    }

    let mounted = true;

    // INITIAL_SESSION restores browser UI state; server access remains protected by RLS.
    // A separate getUser request holds the auth lock and can overwrite newer events.

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<string | null> => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return "Google 로그인이 아직 설정되지 않았습니다.";

    setLoginError(null);
    try {
      startLoginReturn(window.sessionStorage, window.location.pathname + window.location.search);
    } catch {
      return "로그인 후 돌아올 화면을 보관하지 못했습니다. 브라우저 저장 허용을 확인해 주세요.";
    }

    try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
        scopes: "openid email profile",
      },
    });

    if (error) cancelLoginReturn(window.sessionStorage);
    return error?.message ?? null;
    } catch {
      try { cancelLoginReturn(window.sessionStorage); } catch { /* Nothing may be replayed automatically. */ }
      return "로그인을 시작하지 못했습니다. 다시 시도해 주세요.";
    }
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    try { cancelLoginReturn(window.sessionStorage); } catch { /* No navigation intent is a safe fallback. */ }
  }, []);

  const value = useMemo(
    () => ({ user, loading, configured, loginError, signInWithGoogle, signOut }),
    [user, loading, configured, loginError, signInWithGoogle, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
