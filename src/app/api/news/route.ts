import { NextRequest, NextResponse } from "next/server";
import { fetchNews } from "@/features/market/server/news";
import { MarketError, validSymbol } from "@/features/market/server/provider";
import { marketResponseError } from "@/features/market/server/http";
export async function GET(request: NextRequest) {
  try {
    const symbol = request.nextUrl.searchParams
      .get("symbol")
      ?.trim()
      .toUpperCase();
    if (symbol !== undefined && !validSymbol(symbol))
      throw new MarketError("유효한 종목 코드가 필요합니다.", 400);
    return NextResponse.json(await fetchNews(symbol, request.signal), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return marketResponseError(error);
  }
}
