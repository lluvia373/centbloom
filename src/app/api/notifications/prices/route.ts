import { evaluateAccountPrices, PriceAlertError } from "@/features/notifications/price-server";

export async function POST(request: Request) {
  try {
    return Response.json(await evaluateAccountPrices(request), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof PriceAlertError ? error.message : "가격 도달 여부를 확인하지 못했습니다." },
      { status: error instanceof PriceAlertError ? error.status : 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
