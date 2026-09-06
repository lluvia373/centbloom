import { translateNewsTitles } from "@/features/market/server/translation-provider";
import { NextRequest, NextResponse } from "next/server";
import { fetchTrendingNews } from "@/features/market/server/trending-news";
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
    const feed = symbol
      ? { stories: await fetchNews(symbol, request.signal), partial: false }
      : await fetchTrendingNews(request.signal);
    const stories = await translateNewsTitles(feed.stories, request.signal);
    return NextResponse.json({ ...feed, stories }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return marketResponseError(error);
  }
}
