import { getSupabaseBrowserClient } from "@/lib/supabase";
import { runSupabaseRequest } from "@/features/auth/session-request";
import type { PriceAlert, PriceAlertInput } from "@/features/watchlist/price-alerts";

export interface NotificationItem {
  event_id: string; delivered_at: string; read_at: string | null;
  kind: "guru_filing" | "guru_amendment" | "watch_change" | "watch_price";
  subject_id: string; title: string; source_url: string; occurred_at: string;
}
export interface VisitWindow { since: string | null; visitedAt: string }
type PriceCheckResponse = {
  data: { error?: string; evaluated: number; emitted: number; unavailable: number };
  error: { code: string; message: string } | null;
};
type PriceCheckQuery = PromiseLike<PriceCheckResponse> & {
  setHeader(name: string, value: string): PriceCheckQuery;
};
export function notificationRepository(userId: string, signal: AbortSignal) {
  const client = getSupabaseBrowserClient();
  if (!client) throw new Error("알림을 저장하려면 계정 연결이 필요합니다.");
  // One operation (including visit, list and session recovery) shares one deadline.
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(20_000)]);
  const rpc = async <T>(name: string, payload: Record<string, unknown>): Promise<T> => {
    const result = await runSupabaseRequest(client, userId, s => client.rpc(name,payload).abortSignal(s),requestSignal);
    if (result.error) throw new Error("알림 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    return result.data as T;
  };
  return {
    priceAlerts: () => rpc<PriceAlert[]>("read_price_alerts", {}),
    savePriceAlerts: (id: string, symbol: string, rules: PriceAlertInput[]) =>
      rpc<PriceAlert[]>("set_price_alerts", { p_request: id, p_symbol: symbol, p_rules: rules }),
    evaluatePrices: async () => {
      const result = await runSupabaseRequest(client, userId, signal => {
        const headers: Record<string, string> = {};
        // Defer HTTP until runSupabaseRequest pins the owning account's header.
        const task: Promise<PriceCheckResponse> = Promise.resolve().then(async () => {
          const response = await fetch("/api/notifications/prices", { method: "POST", signal, headers, cache: "no-store" });
          const data = await response.json() as PriceCheckResponse["data"];
          return { data, error: response.ok ? null : { code: response.status === 401 ? "PGRST303" : "PRICE_CHECK", message: data.error ?? "가격 알림 확인에 실패했습니다." } };
        });
        const query: PriceCheckQuery = Object.assign(task, {
          setHeader(name: string, value: string): PriceCheckQuery { headers[name] = value; return query; },
        });
        return query;
      }, requestSignal);
      if (result.error) throw new Error(result.error.message);
      return result.data;
    },
    visit: (id: string) => rpc<VisitWindow>("visit_notifications",{p_visit:id}),
    list: (before?: NotificationItem) => rpc<NotificationItem[]>("read_notifications",{p_before:before?.delivered_at??null,p_before_id:before?.event_id??null}),
    hasUnread: async () => {
      const result = await runSupabaseRequest(client, userId, s => client
        .from("account_notifications").select("event_id")
        .eq("user_id", userId).is("read_at", null).limit(1).abortSignal(s), requestSignal);
      if (result.error || !Array.isArray(result.data)) throw new Error("새 알림 여부를 확인하지 못했습니다.");
      return result.data.length > 0;
    },
    markRead: (id:string) => rpc<void>("mark_notification_read",{p_event:id}),
    follow: (id:string,guru:string,active:boolean) => rpc<boolean>("set_guru_follow",{p_request:id,p_guru:guru,p_active:active}),
    followed: async (guru:string) => {
      const result = await runSupabaseRequest(client,userId,s=>client.from("guru_follows").select("active").eq("user_id",userId).eq("guru_id",guru).abortSignal(s).maybeSingle(),requestSignal);
      if(result.error) throw new Error("구루 저장 상태를 확인하지 못했습니다.");
      return result.data?.active === true;
    },
  };
}
/** A first visit is a baseline, not an invented set of changes. Same rows power both views. */
export function visitSummary(items: NotificationItem[], window: VisitWindow | null, limit=3) {
  if (!window?.since) return [];
  const since = Date.parse(window.since), end = Date.parse(window.visitedAt);
  if (!Number.isFinite(since) || !Number.isFinite(end) || since > end) return [];
  return items.filter(item => !item.read_at && Date.parse(item.delivered_at) > since && Date.parse(item.delivered_at) <= end).slice(0,limit);
}
