import { NextResponse } from "next/server";
import { MarketError } from "./provider";
function errorDiagnostic(error: unknown) {
  const detail = error instanceof Error ? error.message : "";
  const rawStatus = error && typeof error === "object"
    ? ("status" in error ? error.status : "code" in error ? error.code : undefined) : undefined;
  const messageStatus = Number(/\bstatus[: ]+(\d{3})\b/i.exec(detail)?.[1]);
  const upstreamStatus = typeof rawStatus === "number" && rawStatus >= 400 && rawStatus <= 599
    ? rawStatus : messageStatus >= 400 && messageStatus <= 599 ? messageStatus : null;
  const name = error instanceof Error && /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(error.name)
    ? error.name : "UnknownError";
  const reason = name === "TimeoutError" ? "timeout"
    : name === "AbortError" ? "aborted"
      : /Cannot perform I\/O|different request/i.test(detail) ? "worker-request-context"
        : upstreamStatus === 429 || /Too Many Requests|rate.?limit/i.test(detail) ? "provider-rate-limit"
          : /crumb|cookie|unauthori[sz]ed|forbidden/i.test(detail) ? "provider-authentication"
            : /validation|unexpected result|parsable|JSON/i.test(detail) || /Validation/.test(name) ? "provider-response"
              : error instanceof MarketError ? "market-input-or-data"
                : upstreamStatus ? "provider-http" : "provider-unknown";
  // Classifications only: provider errors can contain URLs, cookies and full payloads.
  return { name, upstreamStatus, reason, message: reason };
}
export function marketResponseError(error: unknown) {
  console.warn("market_server_error", errorDiagnostic(error));
  return NextResponse.json(
    {
      error:
        error instanceof MarketError
          ? error.message
          : "시장 데이터를 불러오지 못했습니다.",
    },
    {
      status: error instanceof MarketError ? error.status : 502,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
