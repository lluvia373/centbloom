import { validateSupabaseConfiguration } from "@/features/auth/supabase-config";
import { fetchQuotes } from "@/features/market/server/quote";
import { priceObservation, type PriceAlert } from "@/features/watchlist/price-alerts";

export class PriceAlertError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
/** No request body or client-provided account/price is accepted. */
export async function evaluateAccountPrices(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw new PriceAlertError("로그인이 필요합니다.", 401);
  const config = validateSupabaseConfiguration({ url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    developmentProjectRef: process.env.NEXT_PUBLIC_SUPABASE_DEV_PROJECT_REF,
    nodeEnv: process.env.NODE_ENV, hostname: new URL(request.url).hostname });
  if (config.status !== "configured") throw new PriceAlertError("가격 알림 연결을 확인해 주세요.", 503);
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]);
  const headers = { apikey: config.publishableKey, Authorization: authorization, "Content-Type": "application/json" };
  const auth = await fetch(config.url + "/auth/v1/user", { headers, signal, cache: "no-store" });
  if (!auth.ok) throw new PriceAlertError("로그인을 다시 확인해 주세요.", 401);
  const user = await auth.json() as { id?: string };
  if (!user.id) throw new PriceAlertError("로그인을 다시 확인해 주세요.", 401);
  const response = await fetch(config.url + "/rest/v1/rpc/read_price_alerts", { method: "POST", headers, body: "{}", signal, cache: "no-store" });
  if (!response.ok) throw new PriceAlertError("가격 알림 설정을 불러오지 못했습니다.", 503);
  const rules = await response.json() as PriceAlert[];
  const symbols = [...new Set(rules.filter(rule => rule.enabled).map(rule => rule.symbol))];
  if (!symbols.length) return { evaluated: 0, emitted: 0, unavailable: 0 };
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new PriceAlertError("가격 알림의 시세 확인이 연결되지 않았습니다. 설정은 보존됩니다.", 503);
  const batch = await fetchQuotes(symbols, signal);
  const observations = symbols.flatMap(symbol => {
    const observed = priceObservation(batch.quotes[symbol], Boolean(batch.errors[symbol]));
    return observed ? [observed] : [];
  });
  if (!observations.length) return { evaluated: 0, emitted: 0, unavailable: symbols.length };
  const saved = await fetch(config.url + "/rest/v1/rpc/evaluate_price_alerts", {
    method: "POST", headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ p_user: user.id, p_quotes: observations }), signal, cache: "no-store",
  });
  if (!saved.ok) throw new PriceAlertError("가격 도달 여부를 저장하지 못했습니다. 다시 확인해 주세요.", 503);
  return { evaluated: observations.length, emitted: Number(await saved.json()), unavailable: symbols.length - observations.length };
}
