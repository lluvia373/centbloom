import type { Release } from "./release";

/** Manually verified official releases; this list is not an automatic data feed. */
export const officialReleases: Release[] = [
  {
    id: "cpi-09",
    at: "2026-09-11T12:30:00Z",
    title: "미국 소비자물가지수",
    detail: "2026년 8월 CPI · 전월 대비 · 계절조정 · 이전치: 2026년 7월",
    source: {
      label: "미국 노동통계국",
      url: "https://www.bls.gov/news.release/archives/cpi_09112026.htm",
    },
    kind: "economic",
    seriesKey: "bls:US:CPI:MOM:SA",
    actual: "0.4",
    forecast: null,
    previous: "0.1",
    previousOriginal: null,
    unit: "%",
    updatedAt: "2026-09-13T02:09:59Z",
    timingEstimated: false,
  },
];
