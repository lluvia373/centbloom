// Development-only placement review. Production must not show dummy inventory.
// Real AdSense serving is not connected; never request ads for local previews.
export const adPreviewEnabled = process.env.NODE_ENV === "development";
