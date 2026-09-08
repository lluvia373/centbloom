"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { isPublicRoute } from "@/features/auth/public-routes";
import { Loader2 } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { useAuth } from "@/hooks/useAuth";
import "@/app/auth.css";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading, configured, signInWithGoogle } = useAuth();
  const pathname=usePathname();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Google/Supabase 환경변수가 준비되기 전에는 기존 공개 앱을 유지합니다.
  if (isPublicRoute(pathname) || !configured) return children;

  if (loading) {
    return (
      <div className="cf-auth-loading">
        <div role="status"><Loader2 size={18} className="animate-spin" aria-hidden="true" />로그인 상태를 확인하고 있어요.</div>
      </div>
    );
  }

  if (user) return children;

  const handleGoogleLogin = async () => {
    setSigningIn(true);
    setError(null);
    try {
      const message = await signInWithGoogle();
      if (message) {
        setError(message);
        setSigningIn(false);
      }
    } catch {
      setError("로그인을 시작하지 못했습니다. 연결을 확인하고 다시 시도해주세요.");
      setSigningIn(false);
    }
  };

  return (
    <div className="cf-auth-page">
      <header className="cf-auth-header">
        <Link href="/" aria-label="Centbloom 시장 홈" className="cf-auth-wordmark"><BrandMark size={36} /><span>centbloom</span></Link><Link href="/" className="text-cf-label text-cf-muted">시장 먼저 둘러보기</Link>
      </header>
      <main id="main-content" className="cf-auth-main">
        <div className="cf-auth-stage">
          <section aria-labelledby="login-title" className="cf-auth-login">
            <div className="cf-auth-login-content">
              <h1 id="login-title">로그인</h1>
              <p className="cf-auth-login-description">처음 로그인하면 계정이 생성됩니다.</p>
              <button type="button" onClick={handleGoogleLogin} disabled={signingIn} aria-busy={signingIn} className="cf-auth-google">
                {signingIn ? <Loader2 size={20} className="animate-spin" aria-hidden="true" /> : (
                  <span className="cf-auth-google-icon">
                    <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.59 4.59 0 0 1-1.99 3.01v2.5h3.22c1.89-1.74 2.99-4.31 2.99-7.34Z" />
                      <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.61-2.43l-3.22-2.5c-.9.6-2.05.97-3.39.97-2.61 0-4.82-1.76-5.61-4.12H3.07v2.59A10 10 0 0 0 12 22Z" />
                      <path fill="#FBBC05" d="M6.39 13.92a6 6 0 0 1 0-3.84V7.49H3.07a10 10 0 0 0 0 9.02l3.32-2.59Z" />
                      <path fill="#EA4335" d="M12 5.96c1.47 0 2.79.51 3.83 1.5l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.93 5.49l3.32 2.59C7.18 7.72 9.39 5.96 12 5.96Z" />
                    </svg>
                  </span>
                )}
                <span>{signingIn ? "Google로 이동 중..." : "Google로 계속하기"}</span>
              </button>
              {error && <p role="alert" className="cf-auth-error">{error}</p>}
            </div>
          </section>
        </div>
      </main>
      <footer className="cf-auth-footer"><span>© Centbloom</span></footer>
    </div>
  );
}
