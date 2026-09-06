import { NextRequest, NextResponse } from "next/server";
import { archiveEnabled, saveReleases } from "@/features/calendar/server/repository";
import { fetchReleases } from "@/features/calendar/server/provider";
import { validMonth, shiftMonth } from "@/features/calendar/model";
export async function POST(request: NextRequest) {
  const secret = process.env.CALENDAR_SYNC_SECRET;
  if (!secret || request.headers.get("authorization") !== "Bearer " + secret)
    return NextResponse.json({error:"Unauthorized"},{status:401});
  const key = process.env.TRADING_ECONOMICS_API_KEY;
  if (!archiveEnabled() || !key || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    return NextResponse.json({error:"Calendar ingestion is not configured"},{status:503});
  const month = request.nextUrl.searchParams.get("month");
  if (!validMonth(month ?? undefined)) return NextResponse.json({error:"Invalid month"},{status:400});
  try {
    // UTC padding captures releases at KST month boundaries. Stable IDs deduplicate overlaps.
    const from = new Date(Date.parse(month+"-01T00:00:00Z")-86400_000).toISOString().slice(0,10);
    const to = shiftMonth(month!,1)+"-01";
    const events = await fetchReleases(from,to,key,request.signal);
    await saveReleases(events,request.signal);
    return NextResponse.json({saved:events.length});
  } catch {
    return NextResponse.json({error:"Calendar ingestion failed; saved history preserved"},{status:502});
  }
}
