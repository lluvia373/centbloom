import { NextResponse } from "next/server";
import { readPreparedChanges } from "@/features/market/server/changes-response";
import { marketResponseError } from "@/features/market/server/http";
import { requireChangesMember } from "@/features/market/server/changes-access";
import { changesView } from "@/features/market/change-research";

export async function GET(request: Request) {
  const full = new URL(request.url).searchParams.get("scope") === "all";
  const headers = { "Cache-Control": full ? "private, no-store" : "public, max-age=30", Vary: "Authorization" };
  try {
    if (full) await requireChangesMember(request);
    const feed = await readPreparedChanges();
    if (!feed) return NextResponse.json({ pending: true }, {
      status: 202, headers: { "Cache-Control": "no-store", "Retry-After": "2" },
    });
    return NextResponse.json(changesView(feed, full), { headers });
  } catch (error) {
    const response = marketResponseError(error);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Vary", "Authorization");
    return response;
  }
}
