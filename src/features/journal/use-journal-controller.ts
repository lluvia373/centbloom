"use client";
import {
  useJournal,
  type JournalDraft,
  type JournalEntry,
  type JournalSentiment,
} from "@/hooks/useJournal";
import { useMemo, useRef, useState, type FormEvent } from "react";
const EMPTY_DRAFT: JournalDraft = {
  title: "",
  symbol: "",
  body: "",
  sentiment: "관찰",
};

export function useJournalController() {
  const {
    entries,
    error: storageError,
    ready,
    saveEntry,
    deleteEntry,
  } = useJournal();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<JournalSentiment | "전체">("전체");
  const [oldestFirst, setOldestFirst] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const [draft, setDraft] = useState<JournalDraft>(EMPTY_DRAFT);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const result = entries.filter(
      (entry) =>
        (filter === "전체" || entry.sentiment === filter) &&
        (!needle ||
          `${entry.title} ${entry.symbol} ${entry.body}`
            .toLocaleLowerCase()
            .includes(needle)),
    );
    return oldestFirst ? result.toReversed() : result;
  }, [entries, query, filter, oldestFirst]);

  const hasUnsavedChanges = () => {
    const original = editingId
      ? entries.find((entry) => entry.id === editingId)
      : undefined;
    const initial = original ?? EMPTY_DRAFT;
    return (
      draft.title !== initial.title ||
      draft.body !== initial.body ||
      draft.symbol !== initial.symbol ||
      draft.sentiment !== initial.sentiment
    );
  };

  const openEditor = (entry?: JournalEntry) => {
    if (
      editorOpen &&
      hasUnsavedChanges() &&
      !window.confirm("작성 중인 내용을 저장하지 않고 다른 노트를 열까요?")
    )
      return;
    setEditingId(entry?.id);
    setDraft(
      entry
        ? {
            title: entry.title,
            symbol: entry.symbol,
            body: entry.body,
            sentiment: entry.sentiment,
          }
        : EMPTY_DRAFT,
    );
    setFormError(null);
    setNotice(null);
    setEditorOpen(true);
    window.setTimeout(() => {
      editorRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      editorRef.current?.querySelector("input")?.focus({ preventScroll: true });
    }, 0);
  };

  const closeEditor = () => {
    if (
      hasUnsavedChanges() &&
      !window.confirm("작성 중인 내용을 저장하지 않고 닫을까요?")
    )
      return;
    setEditorOpen(false);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const error = saveEntry(draft, editingId);
    if (error) {
      setFormError(error);
      return;
    }
    setNotice(editingId ? "노트를 수정했습니다." : "투자 노트를 저장했습니다.");
    setEditorOpen(false);
    setDraft(EMPTY_DRAFT);
    setFilter("전체");
    setQuery("");
  };

  const remove = (id: string) => {
    const error = deleteEntry(id);
    if (error) {
      setNotice(error);
      return;
    }
    setPendingDelete(null);
    if (editingId === id) setEditorOpen(false);
    setNotice("노트를 삭제했습니다.");
  };

  return {
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
  };
}
