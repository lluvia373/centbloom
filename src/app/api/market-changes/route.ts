import { NextRequest, NextResponse } from "next/server";
import { fetchMarketChanges } from "@/features/market/server/market-changes";
import { marketResponseError } from "@/features/market/server/http";

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await fetchMarketChanges(request.signal), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return marketResponseError(error);
  }
}
