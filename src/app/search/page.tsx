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
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#617365]">
          YOUR NEXT CHAPTER
        </p>
        <h1 className="mt-2 text-[28px] font-semibold tracking-tight text-[#1b2c26]">
          작은 기록이 쌓이는 곳
        </h1>
        <p className="mt-2 text-sm leading-6 text-[#617365]">
          관심 있는 기업을 찾고, 나의 매수와 매도를 차곡차곡 기록하세요.
        </p>
      </div>
      <TransactionForm key={symbol ?? "new"} initialSymbol={symbol} />
    </div>
  );
}
