/** Dates are supplied by the calculation model, not inferred from a quote's fetch time. */
function appliedFxDates(dates: readonly string[] = []): string | null {
  const labels = [...new Set(dates)].sort().map((date) => {
    const [, month, day] = date.split("-");
    return `${Number(month)}/${Number(day)}`;
  });
  return labels.length > 0 ? labels.join("·") : null;
}

export function dailyReferenceLabel(dates?: readonly string[]): string | null {
  const days = appliedFxDates(dates);
  return days ? `${days} 일별 환율 적용` : null;
}

export function carriedFxLabel(dates?: readonly string[]): string | null {
  const days = appliedFxDates(dates);
  return days ? `${days} 최종 수신 환율 적용` : null;
}
