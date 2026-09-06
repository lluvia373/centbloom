import type { Release } from "../release";
export function archiveEnabled() { return process.env.CALENDAR_ARCHIVE_ENABLED === "true"; }
async function request(path: string, signal: AbortSignal, body?: unknown) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = body === undefined ? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY : process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Calendar storage is not configured");
  const response = await fetch(url + "/rest/v1/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {apikey:key, ...(body !== undefined ? {Authorization:"Bearer " + key} : {}), "Content-Type":"application/json"},
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.any([signal,AbortSignal.timeout(20_000)]), cache:"no-store",
  });
  if (!response.ok) throw new Error("Calendar storage HTTP " + response.status);
  return response.json();
}
export async function readReleases(filter: {from?:string; to?:string; series?:string; id?:string}, signal: AbortSignal): Promise<Release[]> {
  const params = new URLSearchParams({select:"payload",order:"release_at.desc",limit:"1000"});
  if (filter.id) params.set("id","eq."+filter.id);
  if (filter.series) params.set("series_key","eq."+filter.series);
  if (filter.from) params.append("release_at","gte."+filter.from);
  if (filter.to) params.append("release_at","lt."+filter.to);
  const rows = await request("economic_releases?"+params,signal) as {payload:Release}[];
  return rows.map((row) => row.payload);
}
export async function saveReleases(events: Release[], signal: AbortSignal) {
  return request("rpc/ingest_economic_releases",signal,{items:events});
}
