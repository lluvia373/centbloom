import { NextRequest, NextResponse } from "next/server";
import { marketEvents } from "@/features/calendar/data";
import { scheduleRelease } from "@/features/calendar/release";
import { archiveEnabled, readReleases } from "@/features/calendar/server/repository";
import { calendarQuery } from "@/features/calendar/server/query";
export async function GET(request:NextRequest) {
  const query=calendarQuery(request.nextUrl.searchParams);
  if (!query) return NextResponse.json({error:"유효한 기간 또는 일정이 필요합니다."},{status:400});
  const asOf=Date.now();
  const headers={"Cache-Control":"no-store"};
  if (!archiveEnabled()) {
    const events=marketEvents.map(scheduleRelease).filter(event=>
      (!query.id || event.id===query.id) && (!query.series || event.seriesKey===query.series) &&
      (!query.from || Date.parse(event.at)>=Date.parse(query.from)) && (!query.to || Date.parse(event.at)<Date.parse(query.to)));
    // Schedules do not supply a historical results archive.
    return NextResponse.json({events:query.series ? [] : events,connected:false,earningsConnected:false,asOf},{headers});
  }
  try {
    const events=await readReleases(query,request.signal);
    return NextResponse.json({events,connected:true,earningsConnected:false,asOf},{headers});
  } catch {
    return NextResponse.json({error:"저장된 일정을 불러오지 못했습니다."},{status:503});
  }
}
