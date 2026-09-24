import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { validateSupabaseConfiguration, type SupabaseConfiguration } from "@/features/auth/supabase-config";

let browserClient: SupabaseClient | null | undefined;
let configuration: SupabaseConfiguration | undefined;

export function getSupabaseConfiguration(): SupabaseConfiguration {
  configuration ??= validateSupabaseConfiguration({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    developmentProjectRef: process.env.NEXT_PUBLIC_SUPABASE_DEV_PROJECT_REF,
    nodeEnv: process.env.NODE_ENV,
    hostname: typeof window === "undefined" ? undefined : window.location.hostname,
  });
  return configuration;
}

export function getSupabaseConfigurationError(): string | null {
  const config = getSupabaseConfiguration();
  return config.status === "error" ? config.message : null;
}

export function isSupabaseConfigured(): boolean {
  // Invalid credentials must not enable the guest-only storage path.
  return getSupabaseConfiguration().status !== "guest";
}

export function getSupabaseBrowserClient(): SupabaseClient | null {
  const config = getSupabaseConfiguration();
  if (config.status === "error") throw new Error(config.message);
  if (typeof window === "undefined") return null;
  if (browserClient !== undefined) return browserClient;

  if (config.status === "guest") {
    browserClient = null;
    return browserClient;
  }

  browserClient = createClient(config.url, config.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return browserClient;
}
