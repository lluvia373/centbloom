import { NextResponse } from "next/server";
import { MarketError } from "./provider";
export function marketResponseError(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof MarketError
          ? error.message
          : "시장 데이터를 불러오지 못했습니다.",
    },
    {
      status: error instanceof MarketError ? error.status : 502,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
