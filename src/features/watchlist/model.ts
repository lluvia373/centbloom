export interface WatchlistItem {
  symbol: string;
  name: string;
  targetPrice: number | null;
  targetCurrency: string | null;
  addedAt: string;
}

export type WatchlistCommand =
  | { operation: "add"; payload: WatchlistItem }
  | { operation: "remove"; payload: { symbol: string } }
  | { operation: "target"; payload: { symbol: string; targetPrice: number | null; targetCurrency: string | null } }
  | { operation: "import"; payload: WatchlistItem[] };

export const WATCHLIST_LIMIT = 50;
export const symbolIsValid = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9.^=_-]{1,40}$/.test(value);
export const currencyIsValid = (value: unknown): value is string =>
  typeof value === "string" && /^(?:[A-Z]{3}|GBp)$/.test(value);

export function validateItems(data: unknown): WatchlistItem[] {
  if (!Array.isArray(data) || data.length > WATCHLIST_LIMIT) throw new Error("관심종목은 최대 50개까지 저장할 수 있습니다.");
  const seen = new Set<string>();
  return data.map((entry: unknown) => {
    if (!entry || typeof entry !== "object") throw new Error("관심종목 정보를 확인해 주세요.");
    const item = entry as Record<string, unknown>;
    if (!symbolIsValid(item.symbol) || seen.has(item.symbol) ||
        typeof item.name !== "string" || !item.name.trim() || item.name.length > 200 ||
        typeof item.addedAt !== "string" || !Number.isFinite(Date.parse(item.addedAt)) ||
        (item.targetPrice !== null && (typeof item.targetPrice !== "number" || !Number.isFinite(item.targetPrice) || item.targetPrice <= 0)) ||
        (item.targetCurrency !== null && !currencyIsValid(item.targetCurrency)) ||
        (item.targetPrice !== null && item.targetCurrency === null)) {
      throw new Error("관심종목 정보를 확인해 주세요.");
    }
    seen.add(item.symbol);
    return { symbol: item.symbol, name: item.name, targetPrice: item.targetPrice as number | null,
      targetCurrency: item.targetCurrency as string | null, addedAt: item.addedAt };
  });
}

export function parseStoredWatchlist(raw: string | null): WatchlistItem[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1 || !("items" in value)) throw new Error();
    return validateItems(value.items);
  } catch {
    throw new Error("저장된 관심종목을 읽을 수 없습니다. 기존 기록은 보존됩니다.");
  }
}

export function applyWatchlistCommand(items: WatchlistItem[], command: WatchlistCommand): WatchlistItem[] {
  if (command.operation === "import") {
    const next = [...items];
    for (const item of validateItems(command.payload)) {
      if (!next.some((entry) => entry.symbol === item.symbol)) next.push(item);
    }
    return validateItems(next);
  }
  const { symbol } = command.payload;
  if (!symbolIsValid(symbol)) throw new Error("이 종목 정보는 저장할 수 없습니다.");
  if (command.operation === "remove") return items.filter((item) => item.symbol !== symbol);
  if (command.operation === "add") {
    const [item] = validateItems([command.payload]);
    if (items.some((entry) => entry.symbol === symbol)) return items;
    return validateItems([...items, item]);
  }
  const { targetPrice, targetCurrency } = command.payload;
  if (targetPrice !== null && (!Number.isFinite(targetPrice) || targetPrice <= 0 || !currencyIsValid(targetCurrency))) {
    throw new Error("올바른 통화와 0보다 큰 목표가를 입력해 주세요.");
  }
  if (!items.some((item) => item.symbol === symbol)) throw new Error("삭제된 종목입니다. 관심종목을 다시 확인해 주세요.");
  return items.map((item) => item.symbol === symbol
    ? { ...item, targetPrice, targetCurrency: targetPrice === null ? null : targetCurrency }
    : item);
}
