import { runSupabaseRequest } from "@/features/auth/session-request";
import { readBrandedStorage } from "@/lib/branded-storage";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { applyWatchlistCommand, parseStoredWatchlist, validateItems, type WatchlistCommand, type WatchlistItem } from "./model";

export interface WatchlistRead {
  items: WatchlistItem[];
  warning?: string | null;
}
export interface WatchlistRepository {
  read(signal: AbortSignal): Promise<WatchlistRead>;
  commit(command: WatchlistCommand, requestId: string, signal: AbortSignal): Promise<WatchlistRead>;
}
export const watchlistStorageKey = (userId: string | null) => "centbloom:watchlist:v1:" + (userId ?? "guest");

function recordsToItems(data: unknown): WatchlistItem[] {
  if (!Array.isArray(data)) throw new Error("관심종목을 불러오지 못했습니다. 다시 시도해 주세요.");
  return validateItems(data.map((row) => ({
    symbol: row.symbol, name: row.name, targetPrice: row.target_price,
    targetCurrency: row.target_currency, addedAt: row.added_at,
  })));
}

function serverFailure(error: { code: string; message: string }): Error {
  if (error.message.includes("watchlist_limit")) return new Error("관심종목은 최대 50개까지 저장할 수 있습니다.");
  if (error.message.includes("watchlist_missing")) return new Error("삭제된 종목입니다. 관심종목을 다시 확인해 주세요.");
  return new Error("관심종목을 저장하거나 불러오지 못했습니다. 연결을 확인하고 다시 시도해 주세요.");
}

/** Server receipts use the same identity for the same legacy content on every device. */
export async function legacyImportId(raw: string): Promise<string> {
  const bytes = Uint8Array.from(unescape(encodeURIComponent("watchlist-import-v1:" + raw)), (character) => character.charCodeAt(0));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  digest[6] = (digest[6] & 15) | 80;
  digest[8] = (digest[8] & 63) | 128;
  const hex = Array.from(digest.slice(0, 16), (value) => value.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
}

export function accountWatchlistRepository(userId: string, storage: Pick<Storage, "getItem"> | null): WatchlistRepository {
  const client = getSupabaseBrowserClient();
  if (!client) throw new Error("계정 저장 연결을 확인해 주세요.");
  let importedRaw: string | null = null;
  let importWarning: string | null = null;
  const commit: WatchlistRepository["commit"] = async (command, requestId, signal) => {
    const { data, error } = await runSupabaseRequest(client, userId, (requestSignal) =>
      client.rpc("commit_watchlist", { request_id: requestId, operation: command.operation, payload: command.payload }).abortSignal(requestSignal), signal);
    if (error) throw serverFailure(error);
    return { items: recordsToItems(data), warning: importWarning };
  };
  return {
    commit,
    async read(signal) {
      let warning: string | null = null;
      let legacy: WatchlistItem[] = [];
      let raw: string | null = null;
      try {
        if (!storage) throw new Error();
        raw = readBrandedStorage(storage, watchlistStorageKey(userId));
        legacy = parseStoredWatchlist(raw);
      } catch {
        warning = "이 기기의 기존 관심종목을 가져오지 못했습니다. 기존 기록은 보존됩니다.";
      }
      if (raw && raw !== importedRaw && legacy.length) {
        const requestId = await legacyImportId(raw);
        signal.throwIfAborted();
        // Import failures remain visible; normal account reads still work.
        try {
          await commit({ operation: "import", payload: legacy }, requestId, signal);
          importedRaw = raw;
        } catch (error) {
          signal.throwIfAborted();
          warning = error instanceof Error ? error.message : "기존 관심종목을 가져오지 못했습니다.";
        }
      }
      importWarning = warning;
      const { data, error } = await runSupabaseRequest(client, userId, (requestSignal) =>
        client.rpc("read_watchlist").abortSignal(requestSignal), signal);
      if (error) throw serverFailure(error);
      return { items: recordsToItems(data), warning };
    },
  };
}

export function localWatchlistRepository(storage: Pick<Storage, "getItem" | "setItem">, key: string): WatchlistRepository {
  const read = () => parseStoredWatchlist(readBrandedStorage(storage, key));
  return {
    async read(signal) { signal.throwIfAborted(); return { items: read() }; },
    async commit(command, _requestId, signal) {
      signal.throwIfAborted();
      const items = applyWatchlistCommand(read(), command);
      try { storage.setItem(key, JSON.stringify({ version: 1, items })); }
      catch { throw new Error("저장하지 못했습니다. 브라우저 저장 공간과 사이트 권한을 확인해 주세요."); }
      return { items };
    },
  };
}
