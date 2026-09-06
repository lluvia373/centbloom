import { NextRequest, NextResponse } from "next/server";
import { moverKinds, type MoverKind } from "@/features/market/movers-model";
import { fetchMovers } from "@/features/market/server/movers";
import { MarketError } from "@/features/market/server/provider";
import { marketResponseError } from "@/features/market/server/http";
export async function GET(request: NextRequest) {
  try {
    const kind = request.nextUrl.searchParams.get("kind");
    if (!moverKinds.includes(kind as MoverKind))
      throw new MarketError("유효한 순위 종류가 필요합니다.", 400);
    return NextResponse.json(
      await fetchMovers(kind as MoverKind, request.signal),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return marketResponseError(error);
  }
}
