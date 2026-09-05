"use client";

import { useState } from "react";
import {
  ArrowUpRight,
  ChartNoAxesCombined,
  Check,
  Layers3,
  Loader2,
  NotebookPen,
  TrendingUp,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading, configured, signInWithGoogle } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Google/Supabase 환경변수가 준비되기 전에는 기존 공개 앱을 유지합니다.
  if (!configured) return children;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f8fa] text-[#617365]">
        <div role="status" className="flex items-center gap-2.5 text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-[#236b50]" />
          워크스페이스를 준비하고 있어요.
        </div>
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
      setError(
        "로그인을 시작하지 못했습니다. 연결을 확인하고 다시 시도해주세요.",
      );
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f8fa] px-5 text-[#1b2c26] sm:px-10">
      <header className="mx-auto flex h-24 max-w-[1280px] items-center justify-between gap-5 sm:h-28">
        <div aria-label="Stockfolio" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#236b50] text-white">
            <ChartNoAxesCombined className="h-[18px] w-[18px]" />
          </span>
          <span className="text-xl font-semibold tracking-[-0.8px]">
            stockfolio<span className="text-[#236b50]">.</span>
          </span>
        </div>
        <p className="hidden text-[10px] font-medium uppercase tracking-[0.2em] text-[#65745f] sm:block">
          Your personal investing space
        </p>
      </header>

      <main className="mx-auto grid max-w-[1280px] overflow-hidden rounded-[28px] border border-[#e3e9e3] bg-white lg:min-h-[670px] lg:grid-cols-[1.06fr_1fr]">
        <section className="relative overflow-hidden bg-[#eaf1e9] px-7 py-10 sm:px-12 sm:py-14 lg:px-14 lg:py-16">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#586b5c]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#65896d]" /> A clear
            view of your investments
          </p>
          <h1 className="mt-9 text-[34px] font-medium leading-[1.5] tracking-[-1.4px] text-[#2e5139] sm:text-[42px]">
            내 투자를 이해하는
            <br />
            가장 차분한 공간.
          </h1>
          <p className="mt-5 max-w-sm text-sm leading-7 text-[#586b5c]">
            흩어진 자산과 매일의 투자 생각을 한곳에.
            <br className="hidden sm:block" /> 숫자를 넘어, 나만의 투자 흐름을
            발견하세요.
          </p>

          <div className="mt-10 space-y-4 border-t border-[#d5e1d3] pt-7 sm:mt-14">
            {[
              {
                icon: Layers3,
                title: "한눈에 보는 내 자산",
                text: "국내외 보유 종목과 자산 비중을 한 화면에서.",
              },
              {
                icon: TrendingUp,
                title: "이유를 살펴보는 성과",
                text: "종목과 환율이 만든 변화를 차근차근.",
              },
              {
                icon: NotebookPen,
                title: "나를 위한 투자 기록",
                text: "매수의 이유부터 다음 투자를 위한 배움까지.",
              },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex gap-3.5">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#d5e1d3] bg-white/35 text-[#617365]">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div>
                  <h2 className="text-xs font-semibold text-[#42634b]">
                    {title}
                  </h2>
                  <p className="mt-1.5 text-[11px] leading-5 text-[#586b5c]">
                    {text}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <ArrowUpRight
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-9 -right-10 h-44 w-44 stroke-[0.4] text-[#d7e4d4]"
          />
        </section>

        <section
          aria-labelledby="login-title"
          className="flex flex-col justify-center px-7 py-12 sm:px-12 sm:py-16 lg:px-16"
        >
          <div className="mx-auto w-full max-w-[360px]">
            <div className="mb-7 flex h-11 w-11 items-center justify-center rounded-2xl border border-[#e1e9df] bg-[#f6f9f4]">
              <ChartNoAxesCombined className="h-5 w-5 text-[#5f8567]" />
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#65745f]">
              Welcome to stockfolio
            </p>
            <h2
              id="login-title"
              className="mt-3 text-[25px] font-semibold tracking-tight"
            >
              투자의 다음 페이지를
              <br />
              함께 시작해요.
            </h2>
            <p className="mt-4 text-xs leading-6 text-[#617365]">
              Google 계정으로 로그인하고
              <br />
              나만의 투자 워크스페이스를 만나보세요.
            </p>

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={signingIn}
              className="mt-8 flex w-full items-center justify-center gap-3 rounded-xl border border-[#dce4dd] bg-white px-4 py-3.5 text-sm font-semibold text-[#1b2c26] shadow-[0_2px_3px_rgba(27,44,38,0.025)] transition hover:border-[#8faa96] hover:bg-[#f8faf7] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {signingIn ? (
                <Loader2 className="h-[18px] w-[18px] animate-spin text-[#236b50]" />
              ) : (
                <svg
                  aria-hidden="true"
                  className="h-[18px] w-[18px]"
                  viewBox="0 0 24 24"
                >
                  <path
                    fill="#4285F4"
                    d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.59 4.59 0 0 1-1.99 3.01v2.5h3.22c1.89-1.74 2.99-4.31 2.99-7.34Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 22c2.7 0 4.96-.9 6.61-2.43l-3.22-2.5c-.9.6-2.05.97-3.39.97-2.61 0-4.82-1.76-5.61-4.12H3.07v2.59A10 10 0 0 0 12 22Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M6.39 13.92a6 6 0 0 1 0-3.84V7.49H3.07a10 10 0 0 0 0 9.02l3.32-2.59Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.96c1.47 0 2.79.51 3.83 1.5l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.93 5.49l3.32 2.59C7.18 7.72 9.39 5.96 12 5.96Z"
                  />
                </svg>
              )}
              {signingIn ? "Google로 이동 중..." : "Google로 계속하기"}
            </button>

            {error && (
              <p
                role="alert"
                className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs leading-6 text-red-700"
              >
                {error}
              </p>
            )}
            <p className="mt-4 text-center text-[10px] leading-5 text-[#65745f]">
              별도 비밀번호를 만들 필요가 없어요.
            </p>

            <div className="mt-9 space-y-2.5 border-t border-[#edf0ee] pt-6">
              <p className="flex items-center gap-2 text-[11px] text-[#617365]">
                <Check className="h-3 w-3 text-[#6b9173]" /> 내 계정에 연결되는
                거래 기록
              </p>
              <p className="flex items-center gap-2 text-[11px] text-[#617365]">
                <Check className="h-3 w-3 text-[#6b9173]" /> 내가 선택하는
                원화·달러 표시
              </p>
              <p className="flex items-center gap-2 text-[11px] text-[#617365]">
                <Check className="h-3 w-3 text-[#6b9173]" /> 이 브라우저에
                보관하는 개인 투자 노트
              </p>
            </div>
          </div>
        </section>
      </main>
      <footer className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-2 py-7 text-[10px] text-[#65745f]">
        <span>Stockfolio · Your investments, in perspective.</span>
        <span>차분하게, 꾸준하게.</span>
      </footer>
    </div>
  );
}
