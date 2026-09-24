// This is an environment safety check, not a substitute for Supabase key verification or RLS.
export const PRODUCTION_SUPABASE_PROJECT_REF = "cvuqzetasndsjtpaqbmr";

export interface SupabaseConfigInput {
  url?: string;
  publishableKey?: string;
  developmentProjectRef?: string;
  nodeEnv?: string;
  hostname?: string;
}

export type SupabaseConfiguration =
  | { status: "guest"; projectRef: null }
  | { status: "configured"; projectRef: string; url: string; publishableKey: string }
  | { status: "error"; projectRef: string | null; code: string; message: string };

export function isLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const octets = /^\d+\.\d+\.\d+\.\d+$/.test(host) ? host.split(".").map(Number) : [];
  const privateAddress = octets.length === 4 && octets.every((part) => part <= 255) &&
    (octets[0] === 127 || octets[0] === 10 || (octets[0] === 192 && octets[1] === 168) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31));
  return host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
    host === "[::1]" || host === "::1" || host === "0.0.0.0" ||
    privateAddress;
}

function isBrowserKey(key: string, projectRef: string): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  // Legacy anon keys carry a ref and role. A secret/service_role key never reaches createClient.
  const parts = key.split(".");
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part)) || parts[2].length !== 43) return false;
  try {
    const decode = (part: string) => JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    const header = decode(parts[0]);
    const claims = decode(parts[1]);
    return header?.alg === "HS256" && header?.typ === "JWT" && claims?.role === "anon" &&
      claims?.iss === "supabase" && claims?.ref === projectRef &&
      typeof claims?.exp === "number" && claims.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}

export function validateSupabaseConfiguration(input: SupabaseConfigInput): SupabaseConfiguration {
  const url = input.url?.trim() ?? "";
  const publishableKey = input.publishableKey?.trim() ?? "";
  const developmentProjectRef = input.developmentProjectRef?.trim() ?? "";
  let projectRef: string | null = null;
  const error = (code: string, message: string): SupabaseConfiguration => ({ status: "error", projectRef, code, message });

  if (!url && !publishableKey) return { status: "guest", projectRef: null };
  if (!url || !publishableKey) return error("incomplete", "로그인 연결 설정이 빠져 있어 기록을 열거나 저장할 수 없습니다.");

  try {
    const parsed = new URL(url);
    const match = /^([a-z0-9]{20})\.supabase\.co$/.exec(parsed.hostname);
    if (parsed.protocol !== "https:" || !match || parsed.username || parsed.password || parsed.port ||
      parsed.pathname !== "/" || parsed.search || parsed.hash) throw new Error("Invalid project URL");
    projectRef = match[1];
  } catch {
    return error("invalid-url", "로그인 연결 주소가 올바르지 않아 기록을 열거나 저장할 수 없습니다.");
  }

  const localHost = input.hostname !== undefined && isLocalHostname(input.hostname);
  const localRuntime = input.nodeEnv === "development" || localHost;
  if ((localRuntime || developmentProjectRef) && projectRef === PRODUCTION_SUPABASE_PROJECT_REF) {
    return error("production-in-development", "로컬에서는 운영 계정 저장소에 연결할 수 없습니다. 개발용 연결 설정을 확인해 주세요.");
  }
  if (localRuntime && !developmentProjectRef) {
    return error("missing-development-ref", "로컬 로그인에 사용할 개발용 계정 저장소가 지정되지 않았습니다.");
  }
  if (developmentProjectRef && (!/^[a-z0-9]{20}$/.test(developmentProjectRef) || developmentProjectRef !== projectRef)) {
    return error("development-ref-mismatch", "개발용 계정 저장소와 로그인 연결 주소가 일치하지 않습니다.");
  }
  // A local production preview is identified in the browser even though NODE_ENV is production.
  if (input.hostname !== undefined && !localHost && (developmentProjectRef || projectRef !== PRODUCTION_SUPABASE_PROJECT_REF)) {
    return error("development-on-public-host", "공개 서비스에 개발용 계정 저장소를 연결할 수 없습니다.");
  }
  if (!localRuntime && !developmentProjectRef && projectRef !== PRODUCTION_SUPABASE_PROJECT_REF) {
    return error("unrecognized-production-project", "공개 서비스의 로그인 연결 설정을 확인해 주세요.");
  }
  if (!isBrowserKey(publishableKey, projectRef)) {
    return error("invalid-browser-key", "브라우저에서 사용할 수 없는 로그인 연결 키입니다. 공개 키 설정을 확인해 주세요.");
  }
  return { status: "configured", projectRef, url, publishableKey };
}
