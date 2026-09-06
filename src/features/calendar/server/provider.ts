import type { Release } from "../release";
function utc(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const normalized = /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : value + "Z";
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function value(raw: unknown): string | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? String(raw) : null;
  if (typeof raw !== "string" || !raw.trim() || /^(null|n\/a|nan|-)$/i.test(raw.trim())) return null;
  return raw.trim().slice(0, 100);
}
export function normalizeReleases(input: unknown): Release[] {
  if (!Array.isArray(input)) throw new Error("Invalid calendar payload");
  return input.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Invalid calendar record");
    const row = item as Record<string, unknown>;
    const at = utc(row.Date), updatedAt = utc(row.LastUpdate);
    const id = String(row.CalendarId ?? row.CalendarID ?? "");
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id) || !at || !updatedAt ||
        typeof row.Event !== "string" || !row.Event || row.Country !== "United States")
      throw new Error("Invalid calendar identity or timestamp");
    const series = row.Symbol || row.Ticker;
    if (typeof series !== "string" || !series) throw new Error("Missing indicator identity");
    let source = "";
    try { const url = new URL(String(row.SourceURL)); if (["http:","https:"].includes(url.protocol) && !url.username && !url.password) source = url.href; } catch { /* Unavailable source link. */ }
    return { id: "te:" + id, seriesKey: "te:US:" + series, at,
      title: row.Event, detail: String(row.Reference ?? ""), unit: String(row.Unit ?? ""),
      source: {label: String(row.Source ?? "발표기관"),url:source},
      actual: value(row.Actual), forecast: value(row.Forecast), previous: value(row.Previous),
      previousOriginal: value(row.Revised), updatedAt, timingEstimated: String(row.DateSpan) === "1" };
  });
}
export async function fetchReleases(from: string, to: string, key: string, signal: AbortSignal) {
  const url = "https://api.tradingeconomics.com/calendar/country/united%20states/" + from + "/" + to + "?f=json";
  const response = await fetch(url, {
    headers: {Authorization:key}, signal: AbortSignal.any([signal,AbortSignal.timeout(20_000)]), cache:"no-store",
  });
  if (!response.ok) throw new Error("Calendar provider HTTP " + response.status);
  return normalizeReleases(await response.json());
}
