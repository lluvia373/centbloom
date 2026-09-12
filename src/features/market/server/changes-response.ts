import { getCloudflareContext } from "@opennextjs/cloudflare";
import { after, connection } from "next/server";
import { cache } from "react";
import { refreshPreparedChanges } from "./changes-refresh";
import { CHANGES_KEY, CHANGES_REFRESH_MS, usableChanges } from "./prepared-changes";

/** Render and API requests only read the complete, previously researched snapshot. */
export const readPreparedChanges = cache(async () => {
  await connection();
  const { env } = await getCloudflareContext({ async: true });
  if (!env.NEWS_CACHE) throw new Error("Change storage unavailable");
  const snapshot = usableChanges(await env.NEWS_CACHE.get(CHANGES_KEY, "json"));
  if (!snapshot || Date.now() - snapshot.preparedAt >= CHANGES_REFRESH_MS) {
    after(async () => {
      try { await refreshPreparedChanges(env); }
      catch { console.warn("changes_refresh_failed"); }
    });
  }
  if (!snapshot && await env.NEWS_CACHE.get("changes-failure:" + CHANGES_KEY))
    throw new Error("Change research unavailable");
  return snapshot?.feed ?? null;
});
export async function initialChanges() {
  try { return await readPreparedChanges(); }
  catch { return null; }
}
