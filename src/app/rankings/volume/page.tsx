import type { Metadata } from "next";
import { RankingPage } from "@/features/home/RankingPage";
import { rankingPages } from "@/features/market/ranking-pages";

export const metadata: Metadata = {
  title: rankingPages.active.title + " | Centbloom",
  description: rankingPages.active.description,
};

export default function VolumeRankingsPage() {
  return <RankingPage kind="active" />;
}
