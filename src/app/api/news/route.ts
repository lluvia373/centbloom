import { NextRequest, NextResponse } from "next/server";
import { readPreparedNews } from "@/features/market/server/news-response";
import { MarketError, validSymbol } from "@/features/market/server/provider";
import { marketResponseError } from "@/features/market/server/http";
export async function GET(request: NextRequest) {
  try {
    const symbol = request.nextUrl.searchParams.get("symbol")?.trim().toUpperCase();
    if (symbol !== undefined && !validSymbol(symbol)) throw new MarketError("유효한 종목 코드가 필요합니다.", 400);
    const feed = await readPreparedNews(symbol);
    if (!feed) return NextResponse.json({ pending: true }, {
      status: 202, headers: { "Cache-Control": "no-store", "Retry-After": "2" },
    });
    return NextResponse.json(feed, { headers: { "Cache-Control": "public, max-age=30" } });
  } catch (error) { return marketResponseError(error); }
}
