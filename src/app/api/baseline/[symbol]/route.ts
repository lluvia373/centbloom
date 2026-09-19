import { marketResponseError } from "@/features/market/server/http";
import { fetchMidnightBaseline } from "@/features/market/server/midnight-price";
import { kstDate } from "@/lib/performance";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  try {
    const { symbol } = await params;
    const now = new Date();
    const date = request.nextUrl.searchParams.get("date") ?? kstDate(now);
    const baseline = await fetchMidnightBaseline(symbol, date, request.signal, now);
    return NextResponse.json(baseline, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return marketResponseError(error);
  }
}
