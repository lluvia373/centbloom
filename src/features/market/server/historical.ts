import { addCalendarDays as addDays } from "@/lib/performance";
import type { DayOHLC } from "@/lib/types";
import { MarketError, providerRequests, yahoo } from "./provider";
export function fetchHistorical(
  symbol: string,
  date: string,
  signal?: AbortSignal,
): Promise<DayOHLC> {
  return providerRequests.request(
    JSON.stringify(["historical", symbol, date]),
    async (signal) => {
      const period2 = addDays(date, 1);

      const result = await yahoo.chart(
        symbol,
        {
          period1: date,
          period2,
          interval: "1d",
        },
        { fetchOptions: { signal } },
      );

      const quote =
        (result.quotes ?? []).find(
          (q) => q.date.toISOString().split("T")[0] === date,
        ) ?? result.quotes?.[0];

      if (
        !quote ||
        [quote.high, quote.low, quote.close, quote.open ?? quote.close].some(
          (value) =>
            typeof value !== "number" || !Number.isFinite(value) || value <= 0,
        )
      ) {
        throw new MarketError(
          "해당 날짜의 거래 데이터가 없습니다. (휴장일일 수 있습니다)",
          404,
        );
      }

      const currency =
        result.meta?.currency ??
        (await yahoo.quote(symbol, {}, { fetchOptions: { signal } })).currency;
      if (!currency)
        throw new MarketError("거래 통화를 확인하지 못했습니다.", 502);

      const data: DayOHLC = {
        date,
        open: quote.open ?? quote.close!,
        high: quote.high!,
        low: quote.low!,
        close: quote.close!,
        currency,
      };

      return data;
    },
    { signal, ttlMs: 300000 },
  );
}
