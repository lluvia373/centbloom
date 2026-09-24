import { projectStorageKey } from "@/lib/project-storage";

const KEY = "centbloom-login-return-v1";
const MAX_AGE = 30 * 60 * 1000;
type ReturnStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** A navigation intent only: never contains an order, credentials, or a write command. */
export function safeReturnPath(input: string): string | null {
  if (!input.startsWith("/") || input.startsWith("//") || /[\\\u0000-\u001f]/.test(input)) return null;
  const url = new URL(input, "https://centbloom.invalid");
  if (url.origin !== "https://centbloom.invalid") return null;
  if (/^\/save-interest\/[A-Za-z0-9^=.%-]+$/.test(url.pathname)) {
    try { if (!validSymbol(decodeURIComponent(url.pathname.split("/")[2]))) return null; } catch { return null; }
    return url.pathname;
  }
  if (url.pathname === "/search") {
    const symbol = url.searchParams.get("symbol");
    return symbol && validSymbol(symbol) ? `/search?symbol=${encodeURIComponent(symbol)}` : "/search";
  }
  if (["/", "/portfolio", "/watchlist", "/journal", "/settings", "/notifications", "/gurus", "/transactions", "/insights", "/movements"].includes(url.pathname)) return url.pathname;
  if (/^\/gurus\/[a-z0-9-]+$/.test(url.pathname)) return url.pathname;
  return null;
}
export function validSymbol(symbol: string) { return /^[A-Za-z0-9^][A-Za-z0-9.^=-]{0,39}$/.test(symbol); }
export function failedReturnPath(target: string) {
  const safe = safeReturnPath(target);
  if (!safe) return "/?auth_result=failed";
  return `${safe}${safe.includes("?")?"&":"?"}auth_result=failed`;
}
export function startLoginReturn(storage: ReturnStorage, path: string, now = Date.now()) {
  const target = safeReturnPath(path);
  if (!target) throw new Error("돌아갈 화면을 확인하지 못했습니다.");
  storage.setItem(projectStorageKey(KEY), JSON.stringify({ version: 1, target, createdAt: now }));
}
export function cancelLoginReturn(storage: ReturnStorage) { storage.removeItem(projectStorageKey(KEY)); }
export function takeLoginReturn(storage: ReturnStorage, now = Date.now()): string | null {
  const key = projectStorageKey(KEY);
  const raw = storage.getItem(key);
  storage.removeItem(key); // Claim before navigating: refresh/auth events must not replay it.
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (value.version !== 1 || !Number.isFinite(value.createdAt) || now < value.createdAt || now - value.createdAt > MAX_AGE || typeof value.target !== "string") return null;
    return safeReturnPath(value.target);
  } catch { return null; }
}
