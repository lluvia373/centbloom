"use client";
import { JournalEditor } from "@/features/journal/JournalEditor";
import { JournalEntryCard } from "@/features/journal/JournalEntryCard";
import { useJournalController } from "@/features/journal/use-journal-controller";

import { useAuth } from "@/hooks/useAuth";
import { JOURNAL_SENTIMENTS } from "@/hooks/useJournal";
import {
  ArrowDownUp,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Clock3,
  Eye,
  NotebookPen,
  Plus,
  Search,
} from "lucide-react";

export default function JournalPage() {
  const { user } = useAuth();
  return <JournalWorkspace key={user?.id ?? "local"} />;
}

function JournalWorkspace() {
  const {
    entries,
    storageError,
    ready,
    query,
    setQuery,
    filter,
    setFilter,
    oldestFirst,
    setOldestFirst,
    editorOpen,
    editingId,
    draft,
    setDraft,
    formError,
    notice,
    pendingDelete,
    setPendingDelete,
    editorRef,
    filtered,
    openEditor,
    closeEditor,
    submit,
    remove,
  } = useJournalController();
  return (
    <div className="space-y-7 text-[#202329]">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mt-2 text-[28px] font-semibold tracking-tight sm:text-[32px]">
            투자 노트
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#727680]">
            숫자 뒤에 있는 생각을 남기고, 나만의 투자 기준을 만드세요.
          </p>
        </div>
        <button
          type="button"
          disabled={!ready || Boolean(storageError)}
          onClick={() => openEditor()}
          className="flex items-center gap-2 rounded-xl bg-[#25282e] px-4 py-3 text-sm font-semibold text-[#ffffff] shadow-sm transition hover:bg-[#25282e] disabled:opacity-40"
        >
          <Plus className="h-4 w-4" /> 노트 작성
        </button>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_290px]">
        <div className="min-w-0 space-y-5">
          <div className="grid grid-cols-3 gap-3 rounded-2xl border border-[#e6e8eb] bg-[#ffffff] p-5 sm:p-6">
            {[
              { label: "기록한 생각", count: entries.length, icon: BookOpen },
              {
                label: "살펴보는 종목",
                count: new Set(
                  entries.map((entry) => entry.symbol).filter(Boolean),
                ).size,
                icon: Eye,
              },
              {
                label: "되돌아본 투자",
                count: entries.filter((entry) => entry.sentiment === "복기")
                  .length,
                icon: Clock3,
              },
            ].map(({ label, count, icon: Icon }, index) => (
              <div
                key={label}
                className={
                  index ? "border-l border-[#e6e8eb] pl-4 sm:pl-6" : ""
                }
              >
                <p className="flex items-center gap-2 text-xs text-[#727680] sm:text-xs">
                  <Icon className="hidden h-3.5 w-3.5 sm:block" />
                  {label}
                </p>
                <p className="mt-3 text-2xl font-semibold tabular-nums">
                  {ready ? count : "—"}
                  <span className="ml-1.5 text-xs font-normal text-[#727680]">
                    {index === 1 ? "종목" : "개"}
                  </span>
                </p>
              </div>
            ))}
          </div>

          {storageError && (
            <p
              role="alert"
              className="rounded-xl border border-[#e9d9b8] bg-[#fff9ed] px-4 py-3 text-sm leading-6 text-[#727680]"
            >
              {storageError}
            </p>
          )}
          {notice && (
            <p
              role="status"
              className="flex items-center gap-2 rounded-xl bg-[#f3f4f6] px-4 py-3 text-sm text-[#727680]"
            >
              <Check className="h-4 w-4 shrink-0" />
              {notice}
            </p>
          )}

          {editorOpen && (
            <JournalEditor
              editorRef={editorRef}
              editingId={editingId}
              closeEditor={closeEditor}
              submit={submit}
              draft={draft}
              setDraft={setDraft}
              formError={formError}
            />
          )}

          <div className="rounded-2xl border border-[#e6e8eb] bg-[#ffffff]">
            <div className="space-y-4 border-b border-[#e6e8eb] p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold">
                  나의 기록{" "}
                  <span className="ml-1.5 font-normal text-[#727680]">
                    {entries.length}
                  </span>
                </h2>
                <button
                  type="button"
                  onClick={() => setOldestFirst(!oldestFirst)}
                  className="flex items-center gap-1.5 text-xs text-[#727680] hover:text-[#727680]"
                >
                  <ArrowDownUp className="h-3 w-3" />
                  {oldestFirst ? "오래된 순" : "최근 수정순"}
                </button>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div
                  className="flex gap-1 rounded-lg bg-[#ffffff] p-1"
                  role="group"
                  aria-label="노트 분류 필터"
                >
                  {(["전체", ...JOURNAL_SENTIMENTS] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setFilter(value)}
                      aria-pressed={filter === value}
                      className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-xs transition ${filter === value ? "bg-[#e9ecf0] font-semibold text-[#25282e] shadow-sm" : "text-[#727680] hover:text-[#727680]"}`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <label className="relative block sm:w-52">
                  <span className="sr-only">투자 노트 검색</span>
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-[#727680]" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="노트, 종목 검색"
                    className="w-full rounded-lg border border-[#e6e8eb] py-2 pl-9 pr-3 text-xs outline-none focus:border-[#9b9fa7]"
                  />
                </label>
              </div>
            </div>

            {!ready ? (
              <p className="px-6 py-20 text-center text-sm text-[#727680]">
                노트를 불러오고 있어요.
              </p>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-16 text-center sm:py-20">
                <div className="relative mb-5 flex h-[76px] w-[76px] items-center justify-center rounded-2xl bg-[#f3f4f6]">
                  <NotebookPen className="h-8 w-8 stroke-[1.3] text-[#727680]" />
                  <span className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-[3px] border-[#dde0e4] bg-[#f3f4f6]">
                    <Plus className="h-3 w-3 text-[#727680]" />
                  </span>
                </div>
                <h3 className="text-base font-semibold">
                  {entries.length === 0
                    ? "좋은 투자는 좋은 기록에서"
                    : "일치하는 노트가 없어요"}
                </h3>
                <p className="mt-2 max-w-xs text-[13px] leading-6 text-[#727680]">
                  {entries.length === 0
                    ? "매수한 이유, 지켜보는 기업, 배운 점까지. 오늘의 생각이 다음 투자의 기준이 됩니다."
                    : "다른 검색어를 입력하거나 분류를 변경해보세요."}
                </p>
                {entries.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => openEditor()}
                    disabled={Boolean(storageError)}
                    className="mt-6 flex items-center gap-2 text-xs font-semibold text-[#727680] disabled:opacity-40"
                  >
                    첫 번째 노트 쓰기 <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setFilter("전체");
                      setQuery("");
                    }}
                    className="mt-5 text-xs font-semibold text-[#727680]"
                  >
                    필터 초기화
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-[#e6e8eb]">
                {filtered.map((entry) => (
                  <JournalEntryCard
                    key={entry.id}
                    entry={entry}
                    openEditor={openEditor}
                    setPendingDelete={setPendingDelete}
                    pendingDelete={pendingDelete}
                    remove={remove}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-5">
          <div className="rounded-2xl border border-[#e6e8eb] bg-[#ffffff] p-6">
            <h2 className="text-xs font-semibold">무엇을 기록할까요?</h2>
            <div className="mt-5 space-y-5">
              {[
                {
                  number: "01",
                  title: "투자의 이유",
                  text: "이 기업의 어떤 점을 좋게 봤나요?",
                },
                {
                  number: "02",
                  title: "나만의 기준",
                  text: "어떤 상황에서 생각이 바뀔까요?",
                },
                {
                  number: "03",
                  title: "투자 후 돌아보기",
                  text: "예상과 실제는 어떻게 달랐나요?",
                },
              ].map((item) => (
                <div key={item.number} className="flex items-start gap-3">
                  <span className="mt-0.5 font-mono text-xs text-[#727680]">
                    {item.number}
                  </span>
                  <div>
                    <h3 className="text-xs font-medium">{item.title}</h3>
                    <p className="mt-1.5 text-xs leading-5 text-[#727680]">
                      {item.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => openEditor()}
              disabled={!ready || Boolean(storageError)}
              className="mt-6 flex w-full items-center justify-between border-t border-[#e6e8eb] pt-4 text-xs font-medium text-[#727680] disabled:opacity-40"
            >
              생각을 기록으로 남기기 <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          <p className="px-2 text-xs leading-5 text-[#727680]">
            노트는 현재 계정별로 이 브라우저에 저장됩니다. 브라우저 데이터를
            지우면 노트도 삭제됩니다.
          </p>
        </aside>
      </div>
    </div>
  );
}
