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

export function getReturnAxis(data: ChartPoint[], keys: string[] = ["portfolioReturn", "benchmarkReturn"]) {
  const ticks = roundedTicks(...numericExtent(data, keys));
  const format = axisFormatter(1, ticks[1] - ticks[0]);
  return { ticks, domain: [ticks[0], ticks[ticks.length - 1]] as [number, number], format: (value: number) => `${format(value)}%` };
}

const DAY_MS = 86_400_000;
type YearBand = { year: number; start: number; end: number };
type DateAxis = {
  ticks: number[];
  domain: [number, number];
  yearBands: YearBand[];
  format: (timestamp: number) => string;
};

function dateTimestamp(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : null;
}

function clippedYears(first: number, last: number): YearBand[] {
  const bands: YearBand[] = [];
  for (let year = new Date(first).getUTCFullYear(); year <= new Date(last).getUTCFullYear(); year += 1) {
    const start = Math.max(first, Date.UTC(year, 0, 1));
    const end = Math.min(last, Date.UTC(year + 1, 0, 1));
    if (end > start) bands.push({ year, start, end });
  }
  return bands;
}

function niceYearStep(minimum: number) {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(1, minimum)));
  return ([1, 2, 5, 10].find((value) => value * magnitude >= minimum) ?? 10) * magnitude;
}

export function getChartDates(data: ChartPoint[], width: number): DateAxis {
  let first = Infinity;
  let last = -Infinity;
  for (const point of data) {
    const timestamp = dateTimestamp(point.date);
    if (timestamp === null) continue;
    first = Math.min(first, timestamp);
    last = Math.max(last, timestamp);
  }
  const formatDay = (timestamp: number) => {
    const date = new Date(timestamp);
    return `${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일`;
  };
  if (!Number.isFinite(first)) return { ticks: [], domain: [0, 1], yearBands: [], format: formatDay };
  if (first === last) return { ticks: [first], domain: [first - DAY_MS / 2, last + DAY_MS / 2], yearBands: [], format: formatDay };

  const domain: [number, number] = [first, last];
  const spanDays = (last - first) / DAY_MS;
  const narrow = width < 600;
  const ticks: number[] = [];
  const firstDate = new Date(first);
  const lastDate = new Date(last);
  const firstYear = firstDate.getUTCFullYear();
  const lastYear = lastDate.getUTCFullYear();

  if (spanDays <= 45) {
    const roughStep = spanDays / (narrow ? 2 : 5);
    const stepDays = [1, 2, 3, 7, 14].find((value) => value >= roughStep) ?? 14;
    const step = stepDays * DAY_MS;
    // Weekly landmarks start on Monday; all positions remain actual UTC dates.
    const anchor = stepDays >= 7 ? Date.UTC(1970, 0, 5) : 0;
    for (let tick = anchor + Math.ceil((first - anchor) / step) * step; tick <= last; tick += step) ticks.push(tick);
    return { ticks, domain, yearBands: firstYear === lastYear ? [] : clippedYears(first, last), format: formatDay };
  }

  // Calendar anniversaries must not pick a coarser interval because of leap days.
  const spanMonths = (lastYear - firstYear) * 12 + lastDate.getUTCMonth() - firstDate.getUTCMonth()
    + (lastDate.getUTCDate() - firstDate.getUTCDate()) / 31;
  const spanYears = spanMonths / 12;
  if (spanYears > 4) {
    const step = niceYearStep(spanYears / (narrow ? 2.5 : 5));
    for (let year = Math.ceil(firstYear / step) * step; year <= lastYear; year += step) {
      const tick = Date.UTC(year, 0, 1);
      if (tick >= first && tick <= last) ticks.push(tick);
    }
    return { ticks, domain, yearBands: [], format: (timestamp) => `${new Date(timestamp).getUTCFullYear()}년` };
  }

  const roughMonths = spanMonths / (narrow ? 4 : 10);
  const step = [1, 2, 3, 6, 12].find((value) => value >= roughMonths) ?? 12;
  const firstMonth = firstYear * 12 + firstDate.getUTCMonth();
  const lastMonth = lastYear * 12 + lastDate.getUTCMonth();
  for (let month = Math.ceil(firstMonth / step) * step; month <= lastMonth; month += step) {
    const tick = Date.UTC(Math.floor(month / 12), month % 12, 1);
    if (tick >= first && tick <= last) ticks.push(tick);
  }
  return { ticks, domain, yearBands: clippedYears(first, last), format: (timestamp) => `${new Date(timestamp).getUTCMonth() + 1}월` };
}
