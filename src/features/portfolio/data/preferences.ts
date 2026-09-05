import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { DisplayCurrency } from "@/lib/types";
export async function readDisplayCurrency(
  userId: string | null,
): Promise<DisplayCurrency | null> {
  const client = getSupabaseBrowserClient();
  if (!client || !userId) return null;
  const { data, error } = await client
    .from("portfolio_preferences")
    .select("display_currency")
    .eq("user_id", userId)
    .abortSignal(AbortSignal.timeout(20_000))
    .maybeSingle();
  if (error) throw error;
  return data ? (data.display_currency === "USD" ? "USD" : "KRW") : null;
}
export async function saveDisplayCurrency(
  userId: string | null,
  value: DisplayCurrency,
) {
  const client = getSupabaseBrowserClient();
  if (!client || !userId) return;
  const { error } = await client
    .from("portfolio_preferences")
    .upsert(
      {
        user_id: userId,
        display_currency: value,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .abortSignal(AbortSignal.timeout(20_000));
  if (error) throw error;
}
