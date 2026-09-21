import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextRequest, NextResponse } from "next/server";
import { FX_HISTORY_FIRST_DATE, fxToday, validFxDate } from "@/features/market/fx-history";
import { dailyFxStore } from "@/features/market/server/fx-history-store";
import { normalizeCurrency } from "@/lib/currency";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const rawCurrency = query.get("currency");
  const currency = normalizeCurrency(rawCurrency ?? "");
  const start = query.get("start") ?? "", end = query.get("end") ?? "";
  if (!rawCurrency || !/^[A-Z]{3}$/.test(currency) || !validFxDate(start) || !validFxDate(end) ||
    start < FX_HISTORY_FIRST_DATE || start > end || end > fxToday()) {
    return NextResponse.json({ error: "유효한 통화와 과거 환율 조회 기간이 필요합니다." }, { status: 400 });
  }
  try {
    const { env } = await getCloudflareContext({ async: true });
    if (!env.NEWS_CACHE) throw new Error("일별 환율 공통 저장소에 연결하지 못했습니다.");
    const series = await dailyFxStore(env.NEWS_CACHE).get(currency, start, end, request.signal);
    return NextResponse.json(series, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "일별 기준환율을 불러오지 못했습니다." }, { status: 503 });
  }
}
