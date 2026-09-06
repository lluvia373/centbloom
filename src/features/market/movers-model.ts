import type { StockQuote } from "@/lib/types";
export const moverKinds = ["active", "gainers", "losers"] as const;
export type MoverKind = (typeof moverKinds)[number];
export interface MoversResult {
  kind: MoverKind;
  quotes: StockQuote[];
  fetchedAt: string;
  total: number;
}
export function normalizeMovers(
  items: unknown[],
  kind: MoverKind,
): StockQuote[] {
  const seen = new Set<string>();
  return items
    .flatMap((item): StockQuote[] => {
      if (!item || typeof item !== "object") return [];
      const q = item as Record<string, unknown>;
      if (
        typeof q.symbol !== "string" ||
        !/^[A-Za-z0-9.^=_-]{1,40}$/.test(q.symbol) ||
        seen.has(q.symbol) ||
        q.currency !== "USD" ||
        q.region !== "US" ||
        q.quoteType !== "EQUITY"
      )
        return [];
      const price = q.regularMarketPrice,
        percent = q.regularMarketChangePercent,
        change = q.regularMarketChange;
      if (
        typeof price !== "number" ||
        !Number.isFinite(price) ||
        price <= 0 ||
        typeof percent !== "number" ||
        !Number.isFinite(percent) ||
        typeof change !== "number" ||
        !Number.isFinite(change)
      )
        return [];
      if (
        (kind === "gainers" && percent <= 0) ||
        (kind === "losers" && percent >= 0)
      )
        return [];
      const volume =
        typeof q.regularMarketVolume === "number" &&
        Number.isFinite(q.regularMarketVolume) &&
        q.regularMarketVolume >= 0
          ? q.regularMarketVolume
          : undefined;
      if (kind === "active" && volume === undefined) return [];
      const rawTime = q.regularMarketTime;
      const time =
        rawTime instanceof Date
          ? rawTime.getTime()
          : typeof rawTime === "number"
            ? rawTime * 1000
            : NaN;
      if (!Number.isFinite(time) || time <= 0) return [];
      seen.add(q.symbol);
      return [
        {
          symbol: q.symbol,
          name: typeof q.shortName === "string" ? q.shortName : q.symbol,
          price,
          change,
          changePercent: percent,
          currency: "USD",
          logoUrl: typeof q.logoUrl === "string" ? q.logoUrl : undefined,
          volume,
          quotedAt: new Date(time).toISOString(),
          marketState:
            typeof q.marketState === "string" ? q.marketState : undefined,
          exchange:
            typeof q.fullExchangeName === "string"
              ? q.fullExchangeName
              : undefined,
        },
      ];
    })
    .sort((a, b) =>
      kind === "gainers"
        ? b.changePercent - a.changePercent
        : kind === "losers"
          ? a.changePercent - b.changePercent
          : (b.volume ?? 0) - (a.volume ?? 0),
    )
    .slice(0, 10);
}
