"use client";

import { TransactionBackupPanel } from "@/components/TransactionBackupPanel";
import { useAuth } from "@/hooks/useAuth";
import { usePreferences,useTransactions } from "@/hooks/usePortfolio";
import { useWorkspace } from "@/hooks/useWorkspace";
import type { DisplayCurrency } from "@/lib/types";
import {
Check,
CheckCircle2,
CircleDollarSign,
Database,
HardDrive,
LayoutDashboard,
UserRound,
} from "lucide-react";
import { useState } from "react";

export default function SettingsPage() {
  const { user } = useAuth();
  const { displayCurrency, setDisplayCurrency } = usePreferences();
  const { transactions } = useTransactions();
  const { isDemo, setDemo } = useWorkspace();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const changeCurrency = (currency: DisplayCurrency) => {
    try {
      setDisplayCurrency(currency);
      setError(null);
      setNotice(
        `표시 통화를 ${currency === "KRW" ? "원화(KRW)" : "달러(USD)"}로 변경했습니다.`,
      );
    } catch {
      setNotice(null);
      setError(
        "표시 통화가 이 화면에 적용되었지만 저장하지 못했습니다. 브라우저 저장 권한을 확인해주세요.",
      );
    }
  };

  return (
    <div className="max-w-[1050px] space-y-6 text-cf-ink">
      <header>
        <h1 className="text-cf-title font-semibold">
          설정
        </h1>

      </header>

      <div className="space-y-4">
        <div className="space-y-4">
          <section className="rounded-cf-card border border-cf-line bg-cf-surface p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-cf-control bg-cf-soft text-cf-muted">
                <CircleDollarSign className="h-4.5 w-4.5" />
              </span>
              <div>
                <h2 className="text-cf-label font-semibold">표시 통화</h2>

              </div>
            </div>
            <div
              className="mt-6 grid gap-3 sm:grid-cols-2"
              role="group"
              aria-label="표시 통화 선택"
            >
              {(
                [
                  {
                    currency: "KRW",
                    symbol: "₩",
                    title: "대한민국 원",
                    description: "Korean Won",
                  },
                  {
                    currency: "USD",
                    symbol: "$",
                    title: "미국 달러",
                    description: "US Dollar",
                  },
                ] as const
              ).map((item) => (
                <button
                  type="button"
                  key={item.currency}
                  aria-pressed={displayCurrency === item.currency}
                  onClick={() => changeCurrency(item.currency)}
                  className={`flex items-center gap-3 rounded-cf-control border p-4 text-left transition ${displayCurrency === item.currency ? "border-cf-focus bg-cf-surface" : "border-cf-line hover:border-cf-line"}`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-cf-pill border border-cf-line bg-cf-surface text-cf-section font-medium">
                    {item.symbol}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-cf-caption font-semibold">
                      {item.title}{" "}
                      <span className="ml-1 text-cf-caption font-normal text-cf-muted">
                        {item.currency}
                      </span>
                    </span>
                    <span className="mt-1 block text-cf-caption text-cf-muted">
                      {item.description}
                    </span>
                  </span>
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-cf-pill ${displayCurrency === item.currency ? "bg-cf-action text-cf-surface" : "border border-cf-line"}`}
                  >
                    {displayCurrency === item.currency && (
                      <Check className="h-2.5 w-2.5" />
                    )}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-4 text-cf-caption leading-[var(--cf-leading-body)] text-cf-muted">
              원래 거래의 통화와 가격은 유지됩니다. 표시 금액은 환율을
              반영합니다.
            </p>
            {notice && (
              <p
                role="status"
                className="mt-4 flex items-center gap-2 text-cf-caption text-cf-muted"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {notice}
              </p>
            )}
            {error && (
              <p role="alert" className="mt-4 text-cf-caption leading-[var(--cf-leading-body)] text-cf-negative">
                {error}
              </p>
            )}
          </section>

          <section className="rounded-cf-card border border-cf-line bg-cf-surface p-4 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-cf-control bg-cf-soft text-cf-muted">
                  <LayoutDashboard className="h-4.5 w-4.5" />
                </span>
                <div>
                  <h2 id="sample-view-title" className="text-cf-label font-semibold">
                    샘플 포트폴리오
                  </h2>

                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isDemo}
                aria-labelledby="sample-view-title"
                aria-describedby="sample-view-description"
                onClick={() => setDemo(!isDemo)}
                className={`relative h-6 w-10 shrink-0 rounded-cf-pill transition-colors ${isDemo ? "bg-cf-action" : "bg-cf-line"}`}
              >
                <span
                  className={`absolute top-1 h-4 w-4 rounded-cf-pill transition-transform ${isDemo ? "left-1 translate-x-4 bg-cf-surface" : "left-1 translate-x-0 bg-cf-surface"}`}
                />
              </button>
            </div>
            <p id="sample-view-description" className="mt-4 text-cf-caption text-cf-muted">
              샘플 데이터 · 내 거래 기록에 추가되지 않음
            </p>
          </section>

          <section className="rounded-cf-card border border-cf-line bg-cf-surface p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-cf-control bg-cf-soft text-cf-muted">
                <UserRound className="h-4.5 w-4.5" />
              </span>
              <div>
                <h2 className="text-cf-label font-semibold">계정과 저장 공간</h2>

              </div>
            </div>
            <dl className="mt-4 divide-y divide-cf-line text-cf-caption">
              <div className="flex flex-wrap items-center justify-between gap-3 py-4">
                <dt className="text-cf-muted">현재 사용 환경</dt>
                <dd className="flex items-center gap-2 font-medium">
                  <span
                    className={`h-1.5 w-1.5 rounded-cf-pill ${user ? "bg-cf-action" : "bg-cf-line"}`}
                  />
                  {user ? "계정 연결됨" : "로컬 워크스페이스"}
                </dd>
              </div>
              {user && (
                <div className="flex flex-wrap justify-between gap-3 py-4">
                  <dt className="text-cf-muted">로그인 계정</dt>
                  <dd className="break-all font-medium">
                    {user.email ?? "연결된 계정"}
                  </dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 py-4">
                <dt className="text-cf-muted">내 거래 기록</dt>
                <dd className="font-medium tabular-nums">
                  {transactions.length.toLocaleString("ko-KR")}건
                </dd>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 py-4">
                <dt className="text-cf-muted">거래 저장</dt>
                <dd className="flex items-center gap-2 font-medium">
                  {user ? (
                    <Database className="h-3 w-3 text-cf-muted" />
                  ) : (
                    <HardDrive className="h-3 w-3 text-cf-muted" />
                  )}
                  {user ? "이 브라우저 + 연결된 계정" : "이 브라우저"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 pb-1 pt-4">
                <dt className="text-cf-muted">관심종목·노트 저장</dt>
                <dd className="font-medium">이 브라우저 · 계정별 분리</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-3 py-4"><dt className="text-cf-muted">표시 통화 저장</dt><dd>{user ? "이 브라우저 + 연결된 계정" : "이 브라우저"}</dd></div>
            </dl>

          </section>

          <section aria-label="거래 데이터 백업과 복원">
            <TransactionBackupPanel />

          </section>
        </div>


      </div>
    </div>
  );
}
