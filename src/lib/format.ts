import { currencyUnitScale, normalizeCurrency } from "./currency";

export function formatCurrency(value: number, currency = "USD"): string {
  const normalized = normalizeCurrency(currency);
  const displayValue = value * currencyUnitScale(currency);

  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: normalized,
    minimumFractionDigits: normalized === "KRW" ? 0 : 2,
    maximumFractionDigits: normalized === "KRW" ? 0 : 2,
  }).format(displayValue);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(value);
}

export function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${y}년 ${parseInt(m, 10)}월 ${parseInt(d, 10)}일`;
}

export function todayISO(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export function formatCompactNumber(value: number): string {
  if (value >= 1_000_000_000_000) {
    return `${(value / 1_000_000_000_000).toFixed(2)}T`;
  }
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  return formatNumber(value);
}
