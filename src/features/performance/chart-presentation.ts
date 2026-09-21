import type { DisplayCurrency } from "@/lib/types";

type ChartPoint = Record<string, unknown>;

function numericExtent(data: ChartPoint[], keys: string[]): [number, number] {
  let minimum = 0;
  let maximum = 0;
  for (const point of data) {
    for (const key of keys) {
      const value = point[key];
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
    }
  }
  return [minimum, maximum];
}

function roundedTicks(minimum: number, maximum: number): number[] {
  if (minimum === maximum) return [0, 0.25, 0.5, 0.75, 1];
  const roughStep = (maximum - minimum) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const step = ([1, 2, 2.5, 5, 10].find((value) => value * magnitude >= roughStep) ?? 10) * magnitude;
  const first = Math.floor(minimum / step);
  const last = Math.ceil(maximum / step);
  return Array.from({ length: last - first + 1 }, (_, index) => Number(((first + index) * step).toPrecision(12)));
}

function axisFormatter(divisor: number, step: number) {
  const scaledStep = step / divisor;
  const exponent = Math.floor(Math.log10(scaledStep));
  const halfStep = Math.abs(scaledStep / 10 ** exponent - 2.5) < 0.000001;
  const maximumFractionDigits = Math.min(8, Math.max(0, -exponent + (halfStep ? 1 : 0)));
  const formatter = new Intl.NumberFormat("ko-KR", { maximumFractionDigits });
  return (value: number) => formatter.format(value / divisor);
}

export function getAssetAxis(data: ChartPoint[], currency: DisplayCurrency) {
  const [minimum, maximum] = numericExtent(data, ["assetValue"]);
  const largest = Math.max(Math.abs(minimum), Math.abs(maximum));
  const [divisor, unitLabel] = currency === "KRW"
    ? largest >= 100_000_000 ? [100_000_000, "억원"] as const : largest >= 10_000 ? [10_000, "만원"] as const : [1, "원"] as const
    : largest >= 1_000_000 ? [1_000_000, "백만 USD"] as const : largest >= 1_000 ? [1_000, "천 USD"] as const : [1, "USD"] as const;
  const ticks = roundedTicks(minimum, maximum);
  return { ticks, domain: [ticks[0], ticks[ticks.length - 1]] as [number, number], unitLabel, format: axisFormatter(divisor, ticks[1] - ticks[0]) };
}

export function getReturnAxis(data: ChartPoint[]) {
  const ticks = roundedTicks(...numericExtent(data, ["portfolioReturn", "benchmarkReturn"]));
  const format = axisFormatter(1, ticks[1] - ticks[0]);
  return { ticks, domain: [ticks[0], ticks[ticks.length - 1]] as [number, number], format: (value: number) => `${format(value)}%` };
}

export function getChartDates(data: ChartPoint[], width: number) {
  const dates = [...new Set(data.map((point) => point.date).filter((date): date is string => typeof date === "string"))];
  const count = width < 480 ? 3 : width < 720 ? 4 : 6;
  if (dates.length === 0) return { ticks: [], format: (value: string) => value };
  const first = dates[0];
  const last = dates[dates.length - 1];
  const span = (Date.parse(last) - Date.parse(first)) / 86_400_000;
  const candidates = span > 45
    ? dates.filter((date, index) => index === 0 || index === dates.length - 1 || date.slice(0, 7) !== dates[index - 1].slice(0, 7))
    : dates;
  const tickCount = Math.min(count, candidates.length);
  const ticks = Array.from({ length: tickCount }, (_, index) => candidates[tickCount === 1 ? 0 : Math.round(index * (candidates.length - 1) / (tickCount - 1))]);
  const crossesYear = first.slice(0, 4) !== last.slice(0, 4);
  return {
    ticks,
    format(value: string) {
      const [year, month, day] = value.split("-").map(Number);
      if (crossesYear) return span > 730 ? `${year}년 ${month}월` : `${String(year).slice(2)}.${month}.${day}`;
      return span > 45 && day === 1 ? `${month}월` : `${month}월 ${day}일`;
    },
  };
}
