import { validateSupabaseConfiguration } from "@/features/auth/supabase-config";
import { MarketError } from "./provider";

/** Full-list access requires a server-verified account, never a query flag or decoded JWT alone. */
export async function requireChangesMember(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw new MarketError("로그인하면 전체 움직임을 볼 수 있어요.", 401);
  const config = validateSupabaseConfiguration({ url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    developmentProjectRef: process.env.NEXT_PUBLIC_SUPABASE_DEV_PROJECT_REF,
    nodeEnv: process.env.NODE_ENV, hostname: new URL(request.url).hostname });
  if (config.status !== "configured") throw new MarketError("로그인 연결을 확인하지 못했어요.", 503);
  const auth = await fetch(config.url + "/auth/v1/user", { cache: "no-store",
    signal: AbortSignal.any([request.signal, AbortSignal.timeout(5_000)]),
    headers: { apikey: config.publishableKey, Authorization: authorization } });
  if (!auth.ok) throw new MarketError("로그인을 다시 확인해 주세요.", auth.status >= 500 ? 503 : 401);
  const user = await auth.json() as { id?: string; is_anonymous?: boolean };
  if (!user.id || user.is_anonymous) throw new MarketError("로그인을 다시 확인해 주세요.", 401);
}
