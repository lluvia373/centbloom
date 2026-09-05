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
Monitor,
ShieldCheck,
UserRound,
} from "lucide-react";
import { useState } from "react";

export default function SettingsPage() {
  const { user, configured } = useAuth();
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
    <div className="max-w-[1050px] space-y-7 text-[#202329]">
      <header>
        <h1 className="mt-2 text-[28px] font-semibold tracking-tight sm:text-[32px]">
          설정
        </h1>
        <p className="mt-2 text-sm leading-6 text-[#727680]">
          나에게 편한 방식으로 보고, 소중한 투자 기록을 관리하세요.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-[#e6e8eb] bg-[#ffffff] p-5 sm:p-7">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f3f4f6] text-[#727680]">
                <CircleDollarSign className="h-4.5 w-4.5" />
              </span>
              <div>
                <h2 className="text-sm font-semibold">표시 통화</h2>
                <p className="mt-1 text-xs text-[#727680]">
                  포트폴리오 금액을 확인할 기준 통화입니다.
                </p>
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
                  className={`flex items-center gap-3 rounded-xl border p-4 text-left transition ${displayCurrency === item.currency ? "border-[#9b9fa7] bg-[#ffffff]" : "border-[#e6e8eb] hover:border-[#e6e8eb]"}`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#e6e8eb] bg-[#ffffff] text-lg font-medium">
                    {item.symbol}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold">
                      {item.title}{" "}
                      <span className="ml-1 text-xs font-normal text-[#727680]">
                        {item.currency}
                      </span>
                    </span>
                    <span className="mt-1 block text-xs text-[#727680]">
                      {item.description}
                    </span>
                  </span>
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${displayCurrency === item.currency ? "bg-[#25282e] text-[#ffffff]" : "border border-[#e6e8eb]"}`}
                  >
                    {displayCurrency === item.currency && (
                      <Check className="h-2.5 w-2.5" />
                    )}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-4 text-xs leading-5 text-[#727680]">
              원래 거래의 통화와 가격은 유지됩니다. 표시 금액은 환율을
              반영합니다.
            </p>
            {notice && (
              <p
                role="status"
                className="mt-4 flex items-center gap-2 text-xs text-[#727680]"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {notice}
              </p>
            )}
            {error && (
              <p role="alert" className="mt-4 text-xs leading-5 text-[#d65353]">
                {error}
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-[#e6e8eb] bg-[#ffffff] p-5 sm:p-7">
            <div className="flex items-center justify-between gap-5">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f3f4f6] text-[#727680]">
                  <LayoutDashboard className="h-4.5 w-4.5" />
                </span>
                <div>
                  <h2 id="sample-view-title" className="text-sm font-semibold">
                    샘플 포트폴리오 둘러보기
                  </h2>
                  <p
                    id="sample-view-description"
                    className="mt-1 text-xs leading-5 text-[#727680]"
                  >
                    예시 자산으로 대시보드와 분석 화면을 살펴보세요.
                  </p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isDemo}
                aria-labelledby="sample-view-title"
                aria-describedby="sample-view-description"
                onClick={() => setDemo(!isDemo)}
                className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${isDemo ? "bg-[#25282e]" : "bg-[#c7cbd1]"}`}
              >
                <span
                  className={`absolute top-1 h-4 w-4 rounded-full shadow-sm transition-transform ${isDemo ? "left-1 translate-x-4 bg-[#ffffff]" : "left-1 translate-x-0 bg-[#ffffff]"}`}
                />
              </button>
            </div>
            <p className="mt-4 text-xs leading-5 text-[#727680]">
              샘플은 별도의 예시 화면입니다. 내 거래 기록에는 추가되지 않습니다.
            </p>
          </section>

          <section className="rounded-2xl border border-[#e6e8eb] bg-[#ffffff] p-5 sm:p-7">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f3f4f6] text-[#727680]">
                <UserRound className="h-4.5 w-4.5" />
              </span>
              <div>
                <h2 className="text-sm font-semibold">계정과 저장 공간</h2>
                <p className="mt-1 text-xs text-[#727680]">
                  기록이 저장되는 위치를 확인하세요.
                </p>
              </div>
            </div>
            <dl className="mt-5 divide-y divide-[#e6e8eb] text-xs">
              <div className="flex flex-wrap items-center justify-between gap-3 py-4">
                <dt className="text-[#727680]">현재 사용 환경</dt>
                <dd className="flex items-center gap-2 font-medium">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${user ? "bg-[#25282e]" : "bg-[#dfe3e8]"}`}
                  />
                  {user ? "계정 연결됨" : "로컬 워크스페이스"}
                </dd>
              </div>
              {user && (
                <div className="flex flex-wrap justify-between gap-3 py-4">
                  <dt className="text-[#727680]">로그인 계정</dt>
                  <dd className="break-all font-medium">
                    {user.email ?? "연결된 계정"}
                  </dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 py-4">
                <dt className="text-[#727680]">내 거래 기록</dt>
                <dd className="font-medium tabular-nums">
                  {transactions.length.toLocaleString("ko-KR")}건
                </dd>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 py-4">
                <dt className="text-[#727680]">거래 저장</dt>
                <dd className="flex items-center gap-1.5 font-medium">
                  {user ? (
                    <Database className="h-3 w-3 text-[#727680]" />
                  ) : (
                    <HardDrive className="h-3 w-3 text-[#727680]" />
                  )}
                  {user ? "이 브라우저 + 연결된 계정" : "이 브라우저"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 pb-1 pt-4">
                <dt className="text-[#727680]">투자 노트 저장</dt>
                <dd className="font-medium">이 브라우저 · 계정별 분리</dd>
              </div>
            </dl>
            <div className="mt-6 rounded-xl bg-[#ffffff] px-4 py-3 text-[13px] leading-6 text-[#727680]">
              {user
                ? "거래와 표시 통화는 연결된 계정으로 동기화합니다. 투자 노트는 현재 브라우저에만 저장됩니다."
                : configured
                  ? "현재 이 브라우저에서 데이터를 관리하고 있습니다. 계정을 연결하면 거래 기록을 동기화할 수 있습니다."
                  : "로그인 연결 없이 바로 사용할 수 있는 로컬 워크스페이스입니다. 거래와 투자 노트는 현재 브라우저에 저장됩니다."}
            </div>
          </section>

          <section aria-label="거래 데이터 백업과 복원">
            <TransactionBackupPanel />
            <p className="mt-3 px-2 text-xs leading-5 text-[#727680]">
              거래 백업에는 투자 노트가 포함되지 않습니다.
            </p>
          </section>
        </div>

        <aside className="space-y-5">
          <div className="rounded-2xl bg-[#f3f4f6] p-6">
            <ShieldCheck className="h-6 w-6 stroke-[1.5] text-[#727680]" />
            <h2 className="mt-6 text-lg font-medium leading-7 text-[#727680]">
              내 투자의 기록,
              <br />
              내가 관리하는 데이터.
            </h2>
            <p className="mt-4 text-[13px] leading-6 text-[#727680]">
              거래 내역을 파일로 보관해두면 다른 브라우저나 기기에서도 다시
              가져올 수 있어요.
            </p>
            <div className="mt-6 border-t border-[#e6e8eb] pt-4 text-[13px] leading-6 text-[#727680]">
              브라우저 데이터를 지우기 전에
              <br />
              거래 기록을 백업해주세요.
            </div>
          </div>
          <div className="rounded-2xl border border-[#e6e8eb] bg-[#ffffff] p-6">
            <Monitor className="h-5 w-5 text-[#727680]" />
            <h2 className="mt-4 text-xs font-semibold">Centifolio</h2>
            <p className="mt-2 text-[13px] leading-6 text-[#727680]">
              Centifolio는 보유 자산과 투자 생각을 한곳에서 살펴보는 개인 투자
              워크스페이스입니다.
            </p>
            <p className="mt-5 text-xs font-semibold uppercase tracking-normal text-[#727680]">
              개인 투자 워크스페이스
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
