import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { QuoteBatchResult } from "../quote-batch";
import { createPreparedQuotes } from "./prepared-quotes";
import { loadPreparationQuotes } from "./quote-source";
import { MarketError } from "./provider";

const local = createPreparedQuotes({ load: loadPreparationQuotes });
let timer: ReturnType<typeof setTimeout> | undefined;
// A dev reload retires the old scheduler; it must not leave a second collector running.
const development = globalThis as typeof globalThis & { centbloomPreparation?: { stop: () => void } };
const owner = { stop: () => clearTimeout(timer) };
if (process.env.NODE_ENV === "development") {
  development.centbloomPreparation?.stop();
  development.centbloomPreparation = owner;
}

function scheduleLocalPreparation() {
  // Workers require durable alarms; never run a timer after a production request.
  if (process.env.NODE_ENV !== "development" || development.centbloomPreparation !== owner) return;
  clearTimeout(timer);
  const at = local.nextPreparationAt();
  if (at === null) return;
  timer = setTimeout(async () => {
    try { await local.prepare(); }
    catch { console.warn("market_preparation_failed", { runtime: "local" }); }
    finally { scheduleLocalPreparation(); }
  }, Math.max(1_000, at - Date.now()));
  timer.unref?.();
}

interface PreparationBindings {
  MARKET_PREPARATION_ENABLED?: string;
  MARKET_QUOTES?: DurableObjectNamespace;
}

/** Optional production coordinator. Off until data rights and deployment checks pass. */
async function sharedReader(): Promise<Fetcher | null> {
  if (process.env.NODE_ENV === "development" || process.env.MARKET_PREPARATION_ENABLED !== "true") return null;
  const { env } = await getCloudflareContext({ async: true });
  const bindings = env as PreparationBindings;
  if (bindings.MARKET_PREPARATION_ENABLED !== "true") return null;
  if (!bindings.MARKET_QUOTES) throw new MarketError("공유 시세 연결을 확인하지 못했습니다.", 503);
  return bindings.MARKET_QUOTES.get(bindings.MARKET_QUOTES.idFromName("public-quotes-v1"), { locationHint: "apac" });
}

export async function readPreparedQuotes(symbols: string[], signal?: AbortSignal): Promise<QuoteBatchResult> {
  signal?.throwIfAborted();
  const shared = await sharedReader();
  if (shared) {
    const response = await shared.fetch("https://market-preparation.internal/quotes", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols }), signal,
    });
    if (!response.ok) {
      const error = new MarketError("공유 시세를 확인하지 못했습니다.", response.status);
      if (response.status === 429) Object.assign(error, { retryAfterSeconds: Number(response.headers.get("Retry-After")) || 60 });
      throw error;
    }
    return response.json() as Promise<QuoteBatchResult>;
  }
  try { return await local.read(symbols, signal); }
  finally { scheduleLocalPreparation(); }
}
