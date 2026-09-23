import { NextResponse } from "next/server";
import { MarketError } from "./provider";
import { PROVIDER_RETRY_FALLBACK_SECONDS } from "./provider-fetch";
function errorDiagnostic(error: unknown) {
  const detail = error instanceof Error ? error.message : "";
  const rawStatus = error && typeof error === "object"
    ? ("status" in error ? error.status : "code" in error ? error.code : undefined) : undefined;
  const messageStatus = Number(/\bstatus[: ]+(\d{3})\b/i.exec(detail)?.[1]);
  const upstreamStatus = typeof rawStatus === "number" && rawStatus >= 400 && rawStatus <= 599
    ? rawStatus : messageStatus >= 400 && messageStatus <= 599 ? messageStatus : null;
  const name = error instanceof Error && /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(error.name)
    ? error.name : "UnknownError";
  const rawEndpoint = error && typeof error === "object" && "providerEndpoint" in error ? error.providerEndpoint : null;
  const providerEndpoint = typeof rawEndpoint === "string" && ["quote", "chart", "auth", "other"].includes(rawEndpoint)
    ? rawEndpoint : null;
  const reason = name === "TimeoutError" ? "timeout"
    : name === "AbortError" ? "aborted"
      : /Cannot perform I\/O|different request/i.test(detail) ? "worker-request-context"
        : upstreamStatus === 429 || /Too Many Requests|rate.?limit/i.test(detail) ? "provider-rate-limit"
          : /crumb|cookie|unauthori[sz]ed|forbidden/i.test(detail) ? "provider-authentication"
            : /validation|unexpected result|parsable|JSON/i.test(detail) || /Validation/.test(name) ? "provider-response"
              : error instanceof MarketError ? "market-input-or-data"
                : upstreamStatus ? "provider-http" : "provider-unknown";
  // Classifications only: provider errors can contain URLs, cookies and full payloads.
  return { name, upstreamStatus, providerEndpoint, reason, message: reason };
}
export function marketResponseError(error: unknown) {
  const diagnostic = errorDiagnostic(error);
  console.warn("market_server_error", diagnostic);
  const rateLimited = diagnostic.upstreamStatus === 429;
  const suppliedRetry = error && typeof error === "object" && "retryAfterSeconds" in error
    ? error.retryAfterSeconds : undefined;
  // The Yahoo library does not retain Retry-After. In that case 60 seconds is
  // our conservative retry policy, not a claim about the provider's reset time.
  const retryAfter = typeof suppliedRetry === "number" && Number.isFinite(suppliedRetry) && suppliedRetry > 0
    ? Math.ceil(suppliedRetry) : PROVIDER_RETRY_FALLBACK_SECONDS;
  return NextResponse.json(
    {
      error:
        rateLimited ? "시세 조회 요청이 많아 잠시 후 다시 시도해 주세요."
          : error instanceof MarketError
          ? error.message
          : "시장 데이터를 불러오지 못했습니다.",
    },
    {
      status: rateLimited ? 429 : error instanceof MarketError ? error.status : 502,
      headers: { "Cache-Control": "no-store", ...(rateLimited ? { "Retry-After": String(retryAfter) } : {}) },
    },
  );
}
