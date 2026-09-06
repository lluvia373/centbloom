/** Public reading routes; private data remains protected by its existing storage/RLS. */
export function isPublicRoute(path: string) {
  return (
    ["/", "/discover", "/community"].includes(path) ||
    /^\/(stock|read)\/[^/]+\/?$/.test(path)
  );
}
