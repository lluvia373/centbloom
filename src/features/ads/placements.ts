/**
 * Stable names become separate AdSense display units when serving is connected.
 * Sizes are placement budgets, not a claim that an ad is currently served.
 */
export const adPlacements = {
  "stock-bottom": { label: "종목 상세 아래", format: "content" },
  "calendar-bottom": { label: "캘린더 아래", format: "banner" },
  "article-bottom": { label: "읽을거리 본문 아래", format: "banner" },
} as const;

export type AdPlacement = keyof typeof adPlacements;
