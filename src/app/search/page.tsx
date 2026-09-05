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
        <h1 className="mt-2 text-[28px] font-semibold tracking-tight text-[#202329]">
          거래 기록
        </h1>
        <p className="mt-2 text-sm leading-6 text-[#727680]">
          관심 있는 기업을 찾고, 나의 매수와 매도를 차곡차곡 기록하세요.
        </p>
      </div>
      <TransactionForm key={symbol ?? "new"} initialSymbol={symbol} />
    </div>
  );
}
