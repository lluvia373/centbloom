"use client";

import { isBrandedStorageKey,readBrandedStorage } from "@/lib/branded-storage";

import { useAuth } from "@/hooks/useAuth";
import { useCallback,useSyncExternalStore } from "react";

export const JOURNAL_SENTIMENTS = ["관찰", "매수 검토", "복기"] as const;
export type JournalSentiment = (typeof JOURNAL_SENTIMENTS)[number];

export interface JournalEntry {
  id: string;
  title: string;
  symbol: string;
  body: string;
  sentiment: JournalSentiment;
  createdAt: string;
  updatedAt: string;
}

export type JournalDraft = Pick<
  JournalEntry,
  "title" | "symbol" | "body" | "sentiment"
>;
interface JournalSnapshot {
  entries: JournalEntry[];
  error: string | null;
  ready: boolean;
}

const CHANGE_EVENT = "centbloom-journal-change";
const MAX_ENTRIES = 1000;
const SERVER_SNAPSHOT: JournalSnapshot = {
  entries: [],
  error: null,
  ready: false,
};
const snapshots = new Map<
  string,
  { raw: string | null; snapshot: JournalSnapshot }
>();
const READ_ERROR: JournalSnapshot = {
  entries: [],
  error:
    "브라우저 저장 공간에 접근할 수 없습니다. 사이트의 저장 권한을 확인해주세요.",
  ready: true,
};

function isEntry(value: unknown): value is JournalEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    entry.id.length > 0 &&
    entry.id.length <= 100 &&
    typeof entry.title === "string" &&
    entry.title.trim().length > 0 &&
    entry.title.length <= 120 &&
    typeof entry.symbol === "string" &&
    entry.symbol.length <= 30 &&
    typeof entry.body === "string" &&
    entry.body.trim().length > 0 &&
    entry.body.length <= 12000 &&
    JOURNAL_SENTIMENTS.includes(entry.sentiment as JournalSentiment) &&
    typeof entry.createdAt === "string" &&
    Number.isFinite(Date.parse(entry.createdAt)) &&
    typeof entry.updatedAt === "string" &&
    Number.isFinite(Date.parse(entry.updatedAt))
  );
}

function readSnapshot(key: string): JournalSnapshot {
  let raw: string | null;
  try {
    raw = readBrandedStorage(localStorage, key);
  } catch {
    return READ_ERROR;
  }
  const cached = snapshots.get(key);
  if (cached && cached.raw === raw) return cached.snapshot;

  let snapshot: JournalSnapshot;
  try {
    if (!raw) {
      snapshot = { entries: [], error: null, ready: true };
    } else {
      const data: unknown = JSON.parse(raw);
      if (!data || typeof data !== "object") throw new Error("invalid");
      const payload = data as Record<string, unknown>;
      if (
        payload.version !== 1 ||
        !Array.isArray(payload.entries) ||
        payload.entries.length > MAX_ENTRIES ||
        !payload.entries.every(isEntry) ||
        new Set(payload.entries.map((entry: JournalEntry) => entry.id)).size !==
          payload.entries.length
      ) {
        throw new Error("invalid");
      }
      snapshot = {
        entries: [...payload.entries].sort((a, b) =>
          b.updatedAt.localeCompare(a.updatedAt),
        ),
        error: null,
        ready: true,
      };
    }
  } catch {
    snapshot = {
      entries: [],
      error:
        "저장된 투자 노트의 형식을 확인할 수 없습니다. 원본 보호를 위해 새 저장을 중단했습니다.",
      ready: true,
    };
  }
  snapshots.set(key, { raw, snapshot });
  return snapshot;
}

function writeEntries(key: string, entries: JournalEntry[]): string | null {
  try {
    localStorage.setItem(key, JSON.stringify({ version: 1, entries }));
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return null;
  } catch {
    return "노트를 저장하지 못했습니다. 브라우저 저장 공간이나 저장 권한을 확인해주세요. 작성한 내용은 유지됩니다.";
  }
}

export function useJournal() {
  const { user, loading } = useAuth();
  const storageKey = `centbloom-journal:v1:${user?.id ?? "local"}`;
  const subscribe = useCallback(
    (listener: () => void) => {
      const handleStorage = (event: StorageEvent) => {
        if (isBrandedStorageKey(event.key, storageKey)) listener();
      };
      window.addEventListener("storage", handleStorage);
      window.addEventListener(CHANGE_EVENT, listener);
      return () => {
        window.removeEventListener("storage", handleStorage);
        window.removeEventListener(CHANGE_EVENT, listener);
      };
    },
    [storageKey],
  );
  const getSnapshot = useCallback(() => readSnapshot(storageKey), [storageKey]);
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => SERVER_SNAPSHOT,
  );

  const saveEntry = useCallback(
    (draft: JournalDraft, id?: string): string | null => {
      if (loading)
        return "계정 정보를 확인하고 있습니다. 잠시 후 다시 시도해주세요.";
      const current = readSnapshot(storageKey);
      if (current.error) return current.error;
      const title = draft.title.trim();
      const body = draft.body.trim();
      const symbol = draft.symbol.trim().toUpperCase();
      if (!title || !body) return "노트 제목과 내용을 입력해주세요.";
      if (
        title.length > 120 ||
        body.length > 12000 ||
        symbol.length > 30 ||
        !JOURNAL_SENTIMENTS.includes(draft.sentiment)
      )
        return "입력한 내용의 길이와 분류를 확인해주세요.";
      const existing = id
        ? current.entries.find((entry) => entry.id === id)
        : undefined;
      if (id && !existing)
        return "이 노트가 다른 탭에서 삭제되었습니다. 내용을 복사한 뒤 새 노트로 저장해주세요.";
      if (!id && current.entries.length >= MAX_ENTRIES)
        return "노트는 최대 1,000개까지 저장할 수 있습니다.";
      const now = new Date().toISOString();
      const entry: JournalEntry = {
        id: existing?.id ?? crypto.randomUUID(),
        title,
        body,
        symbol,
        sentiment: draft.sentiment,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      return writeEntries(
        storageKey,
        existing
          ? current.entries.map((item) => (item.id === id ? entry : item))
          : [entry, ...current.entries],
      );
    },
    [storageKey, loading],
  );

  const deleteEntry = useCallback(
    (id: string): string | null => {
      if (loading) return "계정 정보를 확인하고 있습니다.";
      const current = readSnapshot(storageKey);
      if (current.error) return current.error;
      return writeEntries(
        storageKey,
        current.entries.filter((entry) => entry.id !== id),
      );
    },
    [storageKey, loading],
  );

  return {
    ...snapshot,
    ready: snapshot.ready && !loading,
    storageKey,
    saveEntry,
    deleteEntry,
  };
}
