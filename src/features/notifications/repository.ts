import { getSupabaseBrowserClient } from "@/lib/supabase";
import { runSupabaseRequest } from "@/features/auth/session-request";

export interface NotificationItem {
  event_id: string; delivered_at: string; read_at: string | null;
  kind: "guru_filing" | "guru_amendment" | "watch_change";
  subject_id: string; title: string; source_url: string; occurred_at: string;
}
export interface VisitWindow { since: string | null; visitedAt: string }
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
