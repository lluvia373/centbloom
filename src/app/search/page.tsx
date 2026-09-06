import { TransactionForm } from "@/components/TransactionForm";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ symbol?: string | string[] }>;
}) {
  const { symbol: requestedSymbol } = await searchParams;
  const symbol = Array.isArray(requestedSymbol)
    ? requestedSymbol[0]
    : requestedSymbol;

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-cf-title font-semibold text-cf-ink">
          거래 기록
        </h1>

      </div>
      <TransactionForm key={symbol ?? "new"} initialSymbol={symbol} />
    </div>
  );
}
