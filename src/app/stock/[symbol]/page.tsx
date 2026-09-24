import { initialNews } from "@/features/market/server/news-response";
import { AdSlot } from "@/features/ads";
import { StockDetail } from "@/components/StockDetail";
import { readPreparedCompany } from "@/features/market/server/prepared-company";
import { StockCompanyFacts } from "@/features/market/StockCompanyFacts";

export default async function StockPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  const [news, company] = await Promise.all([
    initialNews(symbol.toUpperCase()), readPreparedCompany(symbol.toUpperCase()),
  ]);

  return <>
    <StockDetail symbol={symbol.toUpperCase()} initialNews={news}>
      <StockCompanyFacts snapshot={company} />
    </StockDetail>
    <AdSlot placement="stock-bottom" />
  </>;
}
