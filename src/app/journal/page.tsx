"use client";
import { JournalEditor } from "@/features/journal/JournalEditor";
import { JournalEntryCard } from "@/features/journal/JournalEntryCard";
import { useJournalController } from "@/features/journal/use-journal-controller";
import styles from "./JournalPage.module.css";

import { useAuth } from "@/hooks/useAuth";
import { JOURNAL_SENTIMENTS } from "@/hooks/useJournal";
import {
  ArrowDownUp,
  BookOpen,
  Check,
  Clock3,
  Eye,
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
  const hasEntries = entries.length > 0;
  const showRecords = ready && hasEntries;
  return (
    <div className={`${styles.page} space-y-6 text-cf-ink`}>
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
          className={`button-primary ${styles.control} disabled:opacity-40`}
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> 노트 작성
        </button>
      </header>

      <div className="space-y-4">
        <div className="min-w-0 space-y-4">
          {showRecords && <div className="grid grid-cols-3 gap-3 rounded-cf-card border border-cf-line bg-cf-surface p-4 sm:p-6">
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
                  index ? "min-w-0 border-l border-cf-line pl-4 sm:pl-6" : "min-w-0"
                }
              >
                <p className="flex items-center gap-2 text-cf-caption text-cf-muted">
                  <Icon className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden="true" />
                  {label}
                </p>
                <p className="mt-3 flex flex-wrap items-baseline gap-2 text-cf-section font-semibold tabular-nums">
                  {ready ? count : "—"}
                  <span className="text-cf-caption font-normal text-cf-muted">
                    {index === 1 ? "종목" : "개"}
                  </span>
                </p>
              </div>
            ))}
          </div>}

          {storageError && (
            <p
              role="alert"
              className="rounded-cf-control border border-cf-negative bg-cf-negative-soft px-4 py-3 text-cf-label text-cf-negative"
            >
              {storageError}
            </p>
          )}
          {notice && (
            <p
              role="status"
              className="flex items-center gap-2 rounded-cf-control bg-cf-soft px-4 py-3 text-cf-label text-cf-muted"
            >
              <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
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
          {(!storageError || hasEntries) && <div className="rounded-cf-card border border-cf-line bg-cf-surface">
            {showRecords && <div className="space-y-4 border-b border-cf-line p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-cf-section font-semibold">나의 기록</h2>
                <button
                  type="button"
                  onClick={() => setOldestFirst(!oldestFirst)}
                  className={`button-secondary ${styles.control}`}
                >
                  <ArrowDownUp className="h-4 w-4" aria-hidden="true" />
                  {oldestFirst ? "오래된 순" : "최근 수정순"}
                </button>
              </div>
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div
                  className="flex min-w-0 flex-wrap gap-1"
                  role="group"
                  aria-label="노트 분류 필터"
                >
                  {(["전체", ...JOURNAL_SENTIMENTS] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setFilter(value)}
                      aria-pressed={filter === value}
                      className={`${styles.control} flex-1 whitespace-nowrap px-3 py-2 ${filter === value ? "bg-cf-soft font-semibold text-cf-ink" : "text-cf-muted hover:bg-cf-soft hover:text-cf-ink"}`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <label className={styles.search}>
                  <span className="sr-only">투자 노트 검색</span>
                  <Search className="h-4 w-4 shrink-0 text-cf-muted" aria-hidden="true" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="노트, 종목 검색"
                    className="text-cf-input"
                  />
                </label>
              </div>
            </div>}

            {!ready ? (
              <p role="status" className="px-6 py-8 text-center text-cf-body text-cf-muted">
                노트를 불러오고 있어요.
              </p>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-8 text-center">
                <p className="text-cf-body text-cf-muted">
                  {!hasEntries
                    ? "작성한 노트 없음"
                    : "일치하는 노트가 없어요"}
                </p>

                {hasEntries && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilter("전체");
                      setQuery("");
                    }}
                    className={`button-secondary ${styles.control} mt-4`}
                  >
                    필터 초기화
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-cf-line">
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
          </div>}
        </div>


      </div>
    </div>
  );
}
