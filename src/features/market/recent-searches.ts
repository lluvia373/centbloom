export interface RecentStock { symbol: string; name: string }
const limit = 6;
function valid(value: unknown): value is RecentStock {
  if (!value || typeof value !== "object") return false;
  const stock = value as RecentStock;
  return typeof stock.symbol === "string" && /^[A-Za-z0-9.^=_-]{1,40}$/.test(stock.symbol)
    && typeof stock.name === "string" && stock.name.length > 0 && stock.name.length <= 200;
}
export function parseRecentSearches(raw: string | null): RecentStock[] {
  try {
    const items: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(items)) return [];
    const seen = new Set<string>();
    return items.filter(valid).filter((stock) => {
      const symbol = stock.symbol.toUpperCase();
      if (seen.has(symbol)) return false;
      seen.add(symbol);
      return true;
    }).slice(0, limit);
  } catch { return []; }
}
export function createRecentSearches(storage: () => Pick<Storage, "getItem" | "setItem">) {
  const key = (userId: string) => "centifolio:recent-searches:v1:" + encodeURIComponent(userId);
  return {
    read(userId: string | null): string | null {
      if (!userId) return null;
      try { return storage().getItem(key(userId)); } catch { return null; }
    },
    record(userId: string | null, stock: RecentStock): boolean {
      if (!userId || !valid(stock)) return false;
      try {
        const target = storage();
        const raw = target.getItem(key(userId));
        // Preserve malformed stored content instead of silently replacing it.
        if (raw !== null && !Array.isArray(JSON.parse(raw))) return false;
        const symbol = stock.symbol.toUpperCase();
        const items = [{ symbol, name: stock.name }, ...parseRecentSearches(raw)
          .filter((item) => item.symbol.toUpperCase() !== symbol)].slice(0, limit);
        target.setItem(key(userId), JSON.stringify(items));
        return true;
      } catch { return false; }
    },
  };
}
