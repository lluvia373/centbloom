import { marketResponseError } from "@/features/market/server/http";
import { MarketError } from "@/features/market/server/provider";
import { fetchQuotes, quoteBatchSymbols } from "@/features/market/server/quote";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    if (request.nextUrl.searchParams.getAll("symbols").length !== 1)
      throw new MarketError("조회할 종목 목록을 확인해 주세요.", 400);
    const symbols = quoteBatchSymbols(request.nextUrl.searchParams.get("symbols"));
    return NextResponse.json(await fetchQuotes(symbols, request.signal), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) { return marketResponseError(error); }
}
