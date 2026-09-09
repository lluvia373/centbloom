import type { Metadata } from "next";
import { RankingPage } from "@/features/home/RankingPage";
import { rankingPages } from "@/features/market/ranking-pages";

export const metadata: Metadata = {
  title: rankingPages.gainers.title + " | Centbloom",
  description: rankingPages.gainers.description,
};

export default function GainersRankingsPage() {
  return <RankingPage kind="gainers" />;
}
