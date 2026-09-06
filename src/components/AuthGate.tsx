"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { isPublicRoute } from "@/features/auth/public-routes";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { useAuth } from "@/hooks/useAuth";
import "@/app/auth.css";

function PortfolioPreview() {
  return (
    <section className="cf-auth-preview" aria-labelledby="preview-title">
      <div className="cf-auth-preview-heading">
        <h2 id="preview-title">내 포트폴리오</h2>
        <span>미리보기</span>
      </div>
      <p className="cf-auth-preview-label">총 투자자산</p>
      <p className="cf-auth-preview-value">24,860,000<span>원</span></p>
      <p className="cf-auth-preview-return"><ArrowUpRight size={15} aria-hidden="true" />2,860,000원 <span>(13.0%)</span></p>
      <div className="cf-auth-preview-chart" aria-hidden="true">
        <svg viewBox="0 0 460 115" preserveAspectRatio="none">
          <path className="cf-auth-chart-grid" d="M0 18H460M0 58H460M0 98H460" />
          <path className="cf-auth-chart-area" d="M0 102L22 100L42 88L65 94L86 80L111 84L134 68L156 77L180 60L202 65L225 53L245 58L269 41L291 48L314 31L337 37L360 23L384 29L407 17L434 20L460 6V115H0Z" />
          <path className="cf-auth-chart-line" d="M0 102L22 100L42 88L65 94L86 80L111 84L134 68L156 77L180 60L202 65L225 53L245 58L269 41L291 48L314 31L337 37L360 23L384 29L407 17L434 20L460 6" />
        </svg>
        <div><span>5월</span><span>6월</span><span>7월</span><span>8월</span></div>
      </div>
      <div className="cf-auth-preview-allocation">
        <div><span className="cf-auth-allocation-dot domestic" /><span>국내 주식</span><strong>33%</strong></div>
        <div><span className="cf-auth-allocation-dot overseas" /><span>해외 주식</span><strong>35%</strong></div>
        <div><span className="cf-auth-allocation-dot etf" /><span>ETF</span><strong>32%</strong></div>
      </div>
      <p className="cf-auth-preview-note">화면 이해를 위한 샘플 데이터입니다.</p>
    </section>
  );
}

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
        <Link href="/" aria-label="Centifolio 시장 홈" className="cf-auth-wordmark"><BrandMark size={36} /><span>centifolio</span></Link><Link href="/" className="text-sm text-[#727680]">시장 먼저 둘러보기 ↗</Link>
      </header>
      <main id="main-content" className="cf-auth-main">
        <div className="cf-auth-stage">
          <section className="cf-auth-story" aria-labelledby="auth-story-title">
            <h1 id="auth-story-title">내 투자를<br />한눈에 정리하세요.</h1>
            <p className="cf-auth-intro">자산과 수익의 변화부터 관심종목과 투자 노트까지.{" "}<br className="cf-auth-desktop-break" />센티폴리오에서 함께 관리하세요.</p>
          </section>
          <section aria-labelledby="login-title" className="cf-auth-login">
            <div className="cf-auth-login-content">
              <h2 id="login-title">센티폴리오 시작하기</h2>
              <p className="cf-auth-login-description">Google 계정으로 간편하게 로그인하세요.<br />처음이라면 새 계정이 만들어집니다.</p>
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
              <div className="cf-auth-storage-note">
                <p>거래 기록은 계정에 연결됩니다.</p>
                <p>관심종목과 투자 노트는 현재 브라우저에 저장됩니다.</p>
              </div>
            </div>
          </section>
          <PortfolioPreview />
        </div>
      </main>
      <footer className="cf-auth-footer"><span>© Centifolio</span><span>포트폴리오 · 성과 분석 · 투자 노트</span></footer>
    </div>
  );
}
