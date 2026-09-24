import type { Metadata } from "next";
import { MarketChangesList } from "@/features/home/MarketChangesList";

export const metadata: Metadata = { title: "평소와 다른 움직임", robots: { index: false, follow: true } };
export default function MovementsPage() { return <MarketChangesList />; }
