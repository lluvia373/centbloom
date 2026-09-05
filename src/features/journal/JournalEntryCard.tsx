"use client";
import { type JournalEntry, type JournalSentiment } from "@/hooks/useJournal";
import { Pencil, Trash2 } from "lucide-react";
const SENTIMENT_STYLE: Record<JournalSentiment, string> = {
  관찰: "bg-[#f3f4f6] text-[#727680]",
  "매수 검토": "bg-[#f3f4f6] text-[#727680]",
  복기: "bg-[#f3f4f6] text-[#d65353]",
};

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

export function JournalEntryCard({
  entry,
  openEditor,
  setPendingDelete,
  pendingDelete,
  remove,
}: {
  entry: JournalEntry;
  openEditor: (entry?: JournalEntry) => void;
  setPendingDelete: (id: string | null) => void;
  pendingDelete: string | null;
  remove: (id: string) => void;
}) {
  return (
    <article key={entry.id} className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-md px-2 py-1 text-xs font-semibold ${SENTIMENT_STYLE[entry.sentiment]}`}
          >
            {entry.sentiment}
          </span>
          {entry.symbol && (
            <span className="rounded-md border border-[#e6e8eb] px-2 py-1 text-xs font-semibold tracking-wide text-[#727680]">
              {entry.symbol}
            </span>
          )}
          <time
            dateTime={entry.updatedAt}
            className="ml-1 text-xs text-[#727680]"
          >
            {dateLabel(entry.updatedAt)}
            {entry.updatedAt !== entry.createdAt ? " · 수정됨" : ""}
          </time>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label={`${entry.title} 수정`}
            onClick={() => openEditor(entry)}
            className="rounded-lg p-2 text-[#727680] hover:bg-[#f3f4f6] hover:text-[#727680]"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label={`${entry.title} 삭제`}
            onClick={() => setPendingDelete(entry.id)}
            className="rounded-lg p-2 text-[#727680] hover:bg-[#fceeee] hover:text-[#d65353]"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <h3 className="mt-3 break-words text-[17px] font-semibold tracking-tight">
        {entry.title}
      </h3>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-[#727680]">
        {entry.body}
      </p>
      {pendingDelete === entry.id && (
        <div
          role="alert"
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#fceeee] px-4 py-3"
        >
          <p className="text-xs text-[#d65353]">
            이 노트를 삭제할까요? 삭제 후 복구할 수 없습니다.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setPendingDelete(null)}
              className="text-xs text-[#727680]"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => remove(entry.id)}
              className="text-xs font-semibold text-[#d65353]"
            >
              삭제하기
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
