import { initialNews } from "@/features/market/server/news-response";
import { AdSlot } from "@/features/ads";
import { StockDetail } from "@/components/StockDetail";

export default async function StockPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  const news = await initialNews(symbol.toUpperCase());

  return <>
    <StockDetail symbol={symbol.toUpperCase()} initialNews={news} />
    <AdSlot placement="stock-bottom" />
  </>;
}
