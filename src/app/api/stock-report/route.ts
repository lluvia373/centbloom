import { NextResponse } from "next/server";
import { marketResponseError } from "@/features/market/server/http";
import { MarketError } from "@/features/market/server/provider";
import { readWatchedReport } from "@/features/market/server/watched-report-response";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    // One public symbol only; personal selections and account IDs cannot enter this endpoint.
    if (params.getAll("symbol").length !== 1 || [...params.keys()].some(key => key !== "symbol"))
      throw new MarketError("종목 하나를 선택해 주세요.", 400);
    const report = await readWatchedReport(params.get("symbol")!);
    if (!report) return NextResponse.json({ pending: true }, {
      status: 202, headers: { "Cache-Control": "no-store", "Retry-After": "2" },
    });
    const maxAge = Math.max(0, Math.min(30, Math.floor((report.expiresAt - Date.now()) / 1000)));
    return NextResponse.json(report, { headers: { "Cache-Control": `public, max-age=${maxAge}` } });
  } catch (error) { return marketResponseError(error); }
}
