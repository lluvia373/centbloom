import { runSupabaseRequest } from "@/features/auth/session-request";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { DisplayCurrency } from "@/lib/types";
export async function readDisplayCurrency(
  userId: string | null,
): Promise<DisplayCurrency | null> {
  const client = getSupabaseBrowserClient();
  if (!client || !userId) return null;
  const { data, error } = await runSupabaseRequest(
    client,
    userId,
    (signal) =>
      client
        .from("portfolio_preferences")
        .select("display_currency")
        .eq("user_id", userId)
        .abortSignal(signal)
        .maybeSingle(),
  );
  if (error) throw error;
  return data ? (data.display_currency === "USD" ? "USD" : "KRW") : null;
}
export async function saveDisplayCurrency(
  userId: string | null,
  value: DisplayCurrency,
) {
  const client = getSupabaseBrowserClient();
  if (!client || !userId) return;
  const preference = {
    user_id: userId,
    display_currency: value,
    updated_at: new Date().toISOString(),
  };
  const { error } = await runSupabaseRequest(
    client,
    userId,
    (signal) =>
      client
        .from("portfolio_preferences")
        .upsert(
          preference,
          { onConflict: "user_id" },
        ).abortSignal(signal),
  );
  if (error) throw error;
}
