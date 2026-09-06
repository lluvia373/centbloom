"use client";
import {
  JOURNAL_SENTIMENTS,
  type JournalDraft,
  type JournalSentiment,
} from "@/hooks/useJournal";
import { X } from "lucide-react";
import { type FormEvent } from "react";
const FIELD_CLASS =
  "w-full rounded-xl border border-[#e6e8eb] bg-[#ffffff] px-4 py-3 text-sm text-[#202329] outline-none transition placeholder:text-[#727680] focus:border-[#9b9fa7] focus:ring-2 focus:ring-[#25282e]/10";
export function JournalEditor({
  editorRef,
  editingId,
  closeEditor,
  submit,
  draft,
  setDraft,
  formError,
}: {
  editorRef: React.RefObject<HTMLDivElement | null>;
  editingId?: string;
  closeEditor: () => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
  draft: JournalDraft;
  setDraft: React.Dispatch<React.SetStateAction<JournalDraft>>;
  formError: string | null;
}) {
  return (
    <div
      ref={editorRef}
      className="rounded-2xl border border-[#e6e8eb] bg-[#ffffff] p-5 shadow-sm sm:p-7"
    >
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="mt-1.5 text-lg font-semibold">
            {editingId ? "노트 수정" : "노트 작성"}
          </h2>
        </div>
        <button
          type="button"
          onClick={closeEditor}
          aria-label="노트 작성 닫기"
          className="rounded-lg p-2 text-[#727680] hover:bg-[#f3f4f6]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label
            htmlFor="note-title"
            className="mb-2 block text-xs font-medium"
          >
            제목 <span className="text-[#727680]">*</span>
          </label>
          <input
            id="note-title"
            value={draft.title}
            onChange={(event) =>
              setDraft({ ...draft, title: event.target.value })
            }
            required
            maxLength={120}

            className={FIELD_CLASS}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="note-symbol"
              className="mb-2 block text-xs font-medium"
            >
              관련 종목 <span className="font-normal text-[#727680]">선택</span>
            </label>
            <input
              id="note-symbol"
              value={draft.symbol}
              onChange={(event) =>
                setDraft({ ...draft, symbol: event.target.value })
              }
              maxLength={30}
              placeholder="예: AAPL, 005930.KS"
              autoCapitalize="characters"
              className={FIELD_CLASS}
            />
          </div>
          <div>
            <label
              htmlFor="note-sentiment"
              className="mb-2 block text-xs font-medium"
            >
              노트 분류
            </label>
            <select
              id="note-sentiment"
              value={draft.sentiment}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  sentiment: event.target.value as JournalSentiment,
                })
              }
              className={FIELD_CLASS}
            >
              {JOURNAL_SENTIMENTS.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="note-body" className="mb-2 block text-xs font-medium">
            투자 생각 <span className="text-[#727680]">*</span>
          </label>
          <textarea
            id="note-body"
            value={draft.body}
            onChange={(event) =>
              setDraft({ ...draft, body: event.target.value })
            }
            required
            maxLength={12000}
            rows={7}
            placeholder={
              "예: 다음 실적에서 영업이익률 확인"
            }
            className={`${FIELD_CLASS} resize-y leading-7`}
          />
          <p className="mt-1 text-right text-xs tabular-nums text-[#727680]">
            {draft.body.length.toLocaleString()} / 12,000
          </p>
        </div>
        {formError && (
          <p role="alert" className="text-sm text-[#d65353]">
            {formError}
          </p>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-[#e6e8eb] pt-4">
          <span className="text-xs text-[#727680]">
            이 브라우저에 비공개로 저장됩니다.
          </span>
          <button
            type="submit"
            className="shrink-0 rounded-xl bg-[#25282e] px-5 py-2.5 text-sm font-semibold text-[#ffffff] hover:bg-[#25282e]"
          >
            {editingId ? "수정 저장" : "노트 저장"}
          </button>
        </div>
      </form>
    </div>
  );
}
