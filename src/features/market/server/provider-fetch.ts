export const PROVIDER_RETRY_FALLBACK_SECONDS = 60;
const yahooHosts = new Set([
  "finance.yahoo.com", "query1.finance.yahoo.com", "query2.finance.yahoo.com",
  "guce.yahoo.com", "consent.yahoo.com",
]);
const MAX_COOLDOWNS = 64;
type ProviderEndpoint = "quote" | "chart" | "auth" | "other";
function endpoint(url: URL): ProviderEndpoint {
  if (url.pathname === "/v7/finance/quote") return "quote";
  if (url.pathname.startsWith("/v8/finance/chart/")) return "chart";
  if (url.pathname === "/v1/test/getcrumb" || ["finance.yahoo.com", "guce.yahoo.com", "consent.yahoo.com"].includes(url.hostname))
    return "auth";
  return "other";
}

export class ProviderRateLimitError extends Error {
  readonly status = 429;
  constructor(public readonly retryAfterSeconds: number, public readonly providerEndpoint: ProviderEndpoint) {
    super("시장 데이터 공급처의 조회 제한으로 잠시 기다려 주세요.");
    this.name = "ProviderRateLimitError";
  }
}

function retrySeconds(value: string | null, now: number): number {
  if (value == null || !value.trim()) return PROVIDER_RETRY_FALLBACK_SECONDS;
  const trimmed = value.trim();
  const seconds = /^\d+$/.test(trimmed) ? Number(trimmed) :
    /^[A-Za-z]{3},/.test(trimmed) ? (Date.parse(trimmed) - now) / 1000 : NaN;
  if (!Number.isFinite(seconds) || seconds < 0) return PROVIDER_RETRY_FALLBACK_SECONDS;
  // Preserve the provider's delay; cap only to prevent numeric overflow.
  return Math.max(1, Math.min(Math.ceil(seconds), Math.floor((Number.MAX_SAFE_INTEGER - now) / 1000)));
}

/** Completed numeric deadlines only; no response bodies or request signals are retained. */
export function createProviderFetch(fetcher: typeof fetch = fetch, now = Date.now): typeof fetch {
  const blockedUntil = new Map<string, number>();
  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const key = yahooHosts.has(url.hostname) ? url.origin + url.pathname : null;
    const startedAt = now();
    for (const [path, until] of blockedUntil)
      if (until <= startedAt) blockedUntil.delete(path);
    const until = key ? blockedUntil.get(key) : undefined;
    if (until != null)
      throw new ProviderRateLimitError(Math.max(1, Math.ceil((until - startedAt) / 1000)), endpoint(url));

    const response = await fetcher(input, {
      ...init,
      signal: AbortSignal.any([
        ...(init?.signal ? [init.signal] : []),
        AbortSignal.timeout(15_000),
      ]),
    });
    if (response.status !== 429 || key == null) return response;
    const limitedAt = now();
    const seconds = retrySeconds(response.headers.get("Retry-After"), limitedAt);
    const deadline = Math.max(blockedUntil.get(key) ?? 0, limitedAt + seconds * 1000);
    blockedUntil.set(key, deadline);
    while (blockedUntil.size > MAX_COOLDOWNS) blockedUntil.delete(blockedUntil.keys().next().value!);
    // Release this invocation's body before throwing; Yahoo otherwise drops its headers.
    await response.body?.cancel().catch(() => undefined);
    throw new ProviderRateLimitError(Math.max(1, Math.ceil((deadline - now()) / 1000)), endpoint(url));
  };
}
