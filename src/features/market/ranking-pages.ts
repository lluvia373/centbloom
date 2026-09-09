import type { MoverKind } from "./movers-model";

export const rankingPages = {
  active: {
    title: "거래량 상위",
    href: "/rankings/volume",
    description: "미국 주식 거래량 상위 종목과 주요뉴스를 살펴보세요.",
  },
  gainers: {
    title: "상승 종목",
    href: "/rankings/gainers",
    description: "미국 주식 상승 종목 순위와 주요뉴스를 살펴보세요.",
  },
  losers: {
    title: "하락 종목",
    href: "/rankings/losers",
    description: "미국 주식 하락 종목 순위와 주요뉴스를 살펴보세요.",
  },
} as const satisfies Record<MoverKind, { title: string; href: string; description: string }>;
