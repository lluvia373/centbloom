"use client";
import { JournalEditor } from "@/features/journal/JournalEditor";
import { JournalEntryCard } from "@/features/journal/JournalEntryCard";
import { useJournalController } from "@/features/journal/use-journal-controller";

import { useAuth } from "@/hooks/useAuth";
import { JOURNAL_SENTIMENTS } from "@/hooks/useJournal";
import {
  ArrowDownUp,
  BookOpen,
  Check,
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
          <h1 className="text-cf-title font-semibold">
            투자 노트
          </h1>

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

      <div className="space-y-4">
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

          <p className="text-cf-caption text-cf-muted">이 브라우저에 계정별 저장 · 브라우저 데이터 삭제 시 노트 삭제</p>
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
              <div className="flex flex-col items-center px-6 py-8 text-center">
                <NotebookPen size={24} className="mb-4 text-cf-muted" aria-hidden="true" />
                <h3 className="text-base font-semibold">
                  {entries.length === 0
                    ? "작성한 노트 없음"
                    : "일치하는 노트가 없어요"}
                </h3>

                {entries.length > 0 && (
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


      </div>
    </div>
  );
}
