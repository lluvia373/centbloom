const scales: Record<string, number> = {
  k: 3, thousand: 3, m: 6, million: 6, b: 9, bn: 9, billion: 9, t: 12, trillion: 12,
  천: 3, 만: 4, 백만: 6, 천만: 7, 억: 8, 십억: 9, 백억: 10, 천억: 11, 조: 12,
};
const currencies: Record<string, string> = {
  "$": "USD", "us$": "USD", usd: "USD", dollars: "USD", dollar: "USD", 달러: "USD",
  "€": "EUR", eur: "EUR", 유로: "EUR", "£": "GBP", gbp: "GBP", 파운드: "GBP",
  "¥": "JPY", jpy: "JPY", 엔: "JPY", "₩": "KRW", krw: "KRW", 원: "KRW",
  "c$": "CAD", cad: "CAD", "a$": "AUD", aud: "AUD",
};
const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function scaledNumber(value: string, exponent: number) {
  const clean = value.replace(/,/g, "").replace(/[.]$/, "");
  const [whole, fraction = ""] = clean.split(".");
  let digits = BigInt(whole + fraction);
  let places = fraction.length - exponent;
  if (places < 0) { digits *= BigInt(10) ** BigInt(-places); places = 0; }
  while (places > 0 && digits % BigInt(10) === BigInt(0)) { digits /= BigInt(10); places--; }
  return digits.toString() + "e-" + places;
}

/** Compare quantities, units and currencies, allowing $700M = 7억 달러 without rounding. */
export function headlineNumbers(text: string): string {
  const dates = text.replace(
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?!\d)/gi,
    (_, month: string, day: string) => (months.indexOf(month.slice(0, 3).toLowerCase()) + 1) + "/" + day,
  );
  const pattern = /(?:(US\$|C\$|A\$|USD\b|EUR\b|GBP\b|JPY\b|KRW\b|CAD\b|AUD\b|[$€£¥₩])\s*)?(\d[\d,]*(?:\.\d+)?)(?:\s*(trillion\b|billion\b|million\b|thousand\b|bn\b|[kmbt]\b|천억|백억|십억|천만|백만|조|억|만|천))?(?:\s*(%|percent\b|퍼센트|USD\b|EUR\b|GBP\b|JPY\b|KRW\b|CAD\b|AUD\b|dollars?\b|달러|유로|파운드|엔|원))?/gi;
  return [...dates.matchAll(pattern)].map(match => {
    const [, prefix, number, scale, suffix] = match;
    const currency = currencies[(prefix || suffix || "").toLowerCase()];
    const conflict = prefix && suffix && currencies[suffix.toLowerCase()] && currencies[prefix.toLowerCase()] !== currencies[suffix.toLowerCase()];
    const kind = conflict ? "conflicting-currency" : currency || (suffix && /^(%|percent|퍼센트)$/i.test(suffix) ? "%" : "number");
    // Preserve explicit negative values, but not separators in dates and numeric ranges.
    const before = dates.slice(0, match.index);
    const negative = /(?:^|[^\d])-$/.test(before) ? "-" : "";
    return kind + ":" + negative + scaledNumber(number, scales[scale?.toLowerCase()] || 0);
  }).sort().join("|");
}
