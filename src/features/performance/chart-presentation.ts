import type { DisplayCurrency } from "@/lib/types";

type ChartPoint = Record<string, unknown>;

function numericExtent(data: ChartPoint[], keys: string[], includeZero = true): [number, number] {
  let minimum = includeZero ? 0 : Infinity;
  let maximum = includeZero ? 0 : -Infinity;
  for (const point of data) {
    for (const key of keys) {
      const value = point[key];
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
    }
  }
  return Number.isFinite(minimum) ? [minimum, maximum] : [0, 0];
}

function roundedTicks(minimum: number, maximum: number, minimumStep = 0): number[] {
  if (minimum === maximum) return [0, 0.25, 0.5, 0.75, 1];
  const roughStep = Math.max((maximum - minimum) / 4, minimumStep);
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const step = ([1, 2, 2.5, 5, 10].find((value) => value * magnitude >= roughStep) ?? 10) * magnitude;
  const first = Math.floor(minimum / step);
  const last = Math.ceil(maximum / step);
  return Array.from({ length: last - first + 1 }, (_, index) => Number(((first + index) * step).toPrecision(15)));
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
  const [minimum, maximum] = numericExtent(data, ["assetValue"], false);
  const largest = Math.max(Math.abs(minimum), Math.abs(maximum));
  const [divisor, unitLabel] = currency === "KRW"
    ? largest >= 100_000_000 ? [100_000_000, "억원"] as const : largest >= 10_000 ? [10_000, "만원"] as const : [1, "원"] as const
    : largest >= 1_000_000 ? [1_000_000, "백만 USD"] as const : largest >= 1_000 ? [1_000, "천 USD"] as const : [1, "USD"] as const;
  const minorUnit = currency === "KRW" ? 1 : 0.01;
  const span = maximum - minimum;
  const padding = Math.max(span > 0 ? span * 0.08 : largest * 0.01, minorUnit, largest * Number.EPSILON * 16);
  const lower = minimum >= 0 ? Math.max(0, minimum - padding) : minimum - padding;
  const ticks = largest === 0 ? [0, minorUnit] : roundedTicks(lower, maximum + padding, minorUnit);
  const format = axisFormatter(divisor, ticks[1] - ticks[0]);
  const width = Math.max(60, ...ticks.map((tick) => format(tick).length * 8 + 24));
  return { ticks, domain: [ticks[0], ticks[ticks.length - 1]] as [number, number], unitLabel, format, width };
}

export function getReturnAxis(data: ChartPoint[], keys: string[] = ["portfolioReturn", "benchmarkReturn"]) {
  const ticks = roundedTicks(...numericExtent(data, keys));
  const format = axisFormatter(1, ticks[1] - ticks[0]);
  return { ticks, domain: [ticks[0], ticks[ticks.length - 1]] as [number, number], format: (value: number) => `${format(value)}%` };
}

const DAY_MS = 86_400_000;
type DateAxis = {
  ticks: number[];
  domain: [number, number];
  format: (timestamp: number) => string;
};

export const DATE_AXIS_HEIGHT = 36;

/** Intraday coordinates stay absolute; all clock labels consistently use KST. */
export function getIntradayDates(data: ChartPoint[], width: number, range: "1d" | "5d"): DateAxis {
  const values = data.map(point => Date.parse(String(point.date))).filter(Number.isFinite);
  const first = values[0] ?? 0;
  const last = values.at(-1) ?? first;
  const domain: [number, number] = first === last ? [first - 30_000, last + 30_000] : [first, last];
  const format = (timestamp: number) => {
    const date = new Date(timestamp + 9 * 3_600_000);
    return range === "1d" ? `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`
      : `${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일`;
  };
  const steps = range === "1d" ? [0.25, 0.5, 1, 2, 3, 4, 6, 12, 24] : [24, 48, 72, 120];
  const ticks = fittingDateTicks(steps, hours => {
    const step = hours * 3_600_000;
    const anchor = -9 * 3_600_000;
    const result: number[] = [];
    for (let at = anchor + Math.ceil((first - anchor) / step) * step; at <= last; at += step) result.push(at);
    return result;
  }, domain, format, width);
  return { domain, ticks, format };
}

export function formatIntradayTooltip(timestamp: number): string {
  const date = new Date(timestamp + 9 * 3_600_000);
  return `${date.getUTCFullYear()}.${String(date.getUTCMonth() + 1).padStart(2, "0")}.${String(date.getUTCDate()).padStart(2, "0")} ${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")} KST`;
}

// Use the same conservative label bounds for tick selection and edge placement.
export function getDateLabelPosition(label: string, x: number, left: number, right: number) {
  const width = [...label].reduce((sum, letter) => sum + (letter.charCodeAt(0) > 127 ? 12 : 7), 0);
  const center = right - left >= width ? Math.max(left + width / 2, Math.min(right - width / 2, x)) : x;
  return { x: center, width };
}

function fittingDateTicks(steps: number[], create: (step: number) => number[], domain: [number, number],
  format: (timestamp: number) => string, width: number) {
  if (!Number.isFinite(width) || width <= 0) return [];
  for (const step of steps) {
    const ticks = create(step);
    if (ticks.length > 6) continue;
    let previousEnd = -Infinity;
    const fits = ticks.every(tick => {
      const position = (tick - domain[0]) / (domain[1] - domain[0]) * width;
      const label = getDateLabelPosition(format(tick), position, 0, width);
      const separated = label.width <= width && label.x - label.width / 2 >= previousEnd + 24;
      previousEnd = label.x + label.width / 2;
      return separated;
    });
    if (fits) return ticks;
  }
  return [];
}

function dateTimestamp(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : null;
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
  if (!Number.isFinite(first)) return { ticks: [], domain: [0, 1], format: formatDay };
  if (first === last) return { ticks: [first], domain: [first - DAY_MS / 2, last + DAY_MS / 2], format: formatDay };

  const domain: [number, number] = [first, last];
  const spanDays = (last - first) / DAY_MS;
  const firstDate = new Date(first);
  const lastDate = new Date(last);
  const firstYear = firstDate.getUTCFullYear();
  const lastYear = lastDate.getUTCFullYear();

  if (spanDays <= 45) {
    const format = firstYear === lastYear ? formatDay : (timestamp: number) => `${new Date(timestamp).getUTCFullYear()}년 ${formatDay(timestamp)}`;
    const ticks = fittingDateTicks([1, 2, 3, 7, 14, 28, 56], stepDays => {
      const values: number[] = [];
      const step = stepDays * DAY_MS;
      // Weekly landmarks start on Monday; all positions remain actual UTC dates.
      const anchor = stepDays >= 7 ? Date.UTC(1970, 0, 5) : 0;
      for (let tick = anchor + Math.ceil((first - anchor) / step) * step; tick <= last; tick += step) values.push(tick);
      return values;
    }, domain, format, width);
    return { ticks, domain, format };
  }

  // Calendar anniversaries must not pick a coarser interval because of leap days.
  const spanMonths = (lastYear - firstYear) * 12 + lastDate.getUTCMonth() - firstDate.getUTCMonth()
    + (lastDate.getUTCDate() - firstDate.getUTCDate()) / 31;
  const spanYears = spanMonths / 12;
  if (spanYears > 4) {
    const format = (timestamp: number) => `${new Date(timestamp).getUTCFullYear()}년`;
    const ticks = fittingDateTicks([1, 2, 5, 10, 20, 50, 100, 200, 500, 1000], step => {
      const values: number[] = [];
      for (let year = Math.ceil(firstYear / step) * step; year <= lastYear; year += step) {
        const tick = Date.UTC(year, 0, 1);
        if (tick >= first && tick <= last) values.push(tick);
      }
      return values;
    }, domain, format, width);
    return { ticks, domain, format };
  }

  const firstMonth = firstYear * 12 + firstDate.getUTCMonth();
  const lastMonth = lastYear * 12 + lastDate.getUTCMonth();
  const format = (timestamp: number) => `${new Date(timestamp).getUTCFullYear()}년 ${new Date(timestamp).getUTCMonth() + 1}월`;
  const ticks = fittingDateTicks([1, 2, 3, 6, 12, 24, 48, 60], step => {
    const values: number[] = [];
    for (let month = Math.ceil(firstMonth / step) * step; month <= lastMonth; month += step) {
      const tick = Date.UTC(Math.floor(month / 12), month % 12, 1);
      if (tick >= first && tick <= last) values.push(tick);
    }
    return values;
  }, domain, format, width);
  return { ticks, domain, format };
}
