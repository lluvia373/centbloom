import { notFound } from "next/navigation";
import { validSymbol } from "@/features/auth/login-return";
import { SaveInterest } from "@/features/watchlist/SaveInterest";
export default async function SaveInterestPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  if (!validSymbol(symbol)) notFound();
  return <SaveInterest symbol={symbol} />;
}
