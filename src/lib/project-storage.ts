/** Development data never falls back to the browser's production or guest records. */
export function projectStorageKey(key: string): string {
  // Keep direct public-env accesses: Next.js replaces these in the browser bundle.
  const projectRef = process.env.NEXT_PUBLIC_SUPABASE_DEV_PROJECT_REF?.trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!projectRef || !/^[a-z0-9]{20}$/.test(projectRef) || !publishableKey) return key;
  try {
    if (new URL(url ?? "").origin !== `https://${projectRef}.supabase.co`) return key;
  } catch {
    return key;
  }
  return `centbloom-dev:${projectRef}:${key}`;
}
