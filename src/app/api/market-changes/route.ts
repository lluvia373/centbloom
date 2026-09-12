import { NextResponse } from "next/server";
import { readPreparedChanges } from "@/features/market/server/changes-response";
import { marketResponseError } from "@/features/market/server/http";

export async function GET() {
  try {
    const feed = await readPreparedChanges();
    if (!feed) return NextResponse.json({ pending: true }, {
      status: 202, headers: { "Cache-Control": "no-store", "Retry-After": "2" },
    });
    return NextResponse.json(feed, { headers: { "Cache-Control": "public, max-age=30" } });
  } catch (error) { return marketResponseError(error); }
}
