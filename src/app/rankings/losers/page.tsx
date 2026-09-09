import type { Metadata } from "next";
import { RankingPage } from "@/features/home/RankingPage";
import { rankingPages } from "@/features/market/ranking-pages";

export const metadata: Metadata = {
  title: rankingPages.losers.title + " | Centbloom",
  description: rankingPages.losers.description,
};

export default function LosersRankingsPage() {
  return <RankingPage kind="losers" />;
}
