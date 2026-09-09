import { rankingPages } from "@/features/market/ranking-pages";

/** Public reading routes; private data remains protected by its existing storage/RLS. */
export function isPublicRoute(path: string) {
  return (
    ["/", "/discover", "/community", "/calendar"].includes(path) ||
    Object.values(rankingPages).some(({ href }) => href === path) ||
    /^\/(stock|read|calendar)\/[^/]+\/?$/.test(path)
  );
}
