export interface MarketStory {
  id: string;
  title: string;
  titleKo?: string;
  publisher: string;
  url: string;
  publishedAt: string;
  symbols: string[];
}
export function normalizeNews(
  items: unknown[],
  now = Date.now(),
): MarketStory[] {
  const seen = new Set<string>();
  return items
    .flatMap((item): MarketStory[] => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      if (
        typeof row.title !== "string" ||
        typeof row.link !== "string" ||
        typeof row.publisher !== "string"
      )
        return [];
      let url: URL;
      try {
        url = new URL(row.link);
      } catch {
        return [];
      }
      const time =
        row.providerPublishTime instanceof Date
          ? row.providerPublishTime.getTime()
          : Date.parse(String(row.providerPublishTime ?? ""));
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        !Number.isFinite(time) ||
        time > now + 300_000 ||
        now - time > 7 * 86400_000 ||
        seen.has(url.href)
      )
        return [];
      seen.add(url.href);
      return [
        {
          id: url.href,
          title: row.title,
          publisher: row.publisher,
          url: url.href,
          publishedAt: new Date(time).toISOString(),
          symbols: Array.isArray(row.relatedTickers)
            ? row.relatedTickers
                .filter(
                  (s): s is string =>
                    typeof s === "string" && /^[A-Za-z0-9.^=_-]{1,40}$/.test(s),
                )
                .slice(0, 3)
            : [],
        },
      ];
    })
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 20);
}
