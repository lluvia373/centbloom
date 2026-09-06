/** Public reading routes; private data remains protected by its existing storage/RLS. */
export function isPublicRoute(path: string) {
  return (
    ["/", "/discover", "/community", "/calendar"].includes(path) ||
    /^\/(stock|read|calendar)\/[^/]+\/?$/.test(path)
  );
}
