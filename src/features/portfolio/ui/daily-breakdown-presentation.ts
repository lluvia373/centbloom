type DisplayCurrency = "KRW" | "USD";

const formatters = {
  KRW: new Intl.NumberFormat("ko-KR", {
    style: "currency", currency: "KRW", minimumFractionDigits: 0, maximumFractionDigits: 0,
  }),
  USD: new Intl.NumberFormat("ko-KR", {
    style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2,
  }),
};

function roundedMinorUnits(value: number, currency: DisplayCurrency): number {
  if (!Number.isFinite(value)) throw new TypeError("Daily breakdown requires finite amounts.");
  const digits = formatters[currency].formatToParts(value)
    .filter((part) => part.type === "integer" || part.type === "fraction")
    .map((part) => part.value).join("");
  const magnitude = Number(digits);
  if (!Number.isSafeInteger(magnitude)) throw new RangeError("Daily breakdown exceeds display precision.");
  return magnitude === 0 ? 0 : value < 0 ? -magnitude : magnitude;
}

export function getDailyBreakdownDisplay(
  change: number,
  priceImpact: number,
  fxImpact: number,
  currency: DisplayCurrency,
): { total: number; stock: number; fx: number } {
  const scale = currency === "KRW" ? 1 : 100;
  const totalMinor = roundedMinorUnits(change, currency);
  let stockMinor = roundedMinorUnits(priceImpact, currency);
  const roundedFxMinor = roundedMinorUnits(fxImpact, currency);
  // Display-only rounding residual: keep the rendered components equal to the rendered total.
  let fxMinor = totalMinor - stockMinor;
  if (!Number.isSafeInteger(fxMinor)) throw new RangeError("Daily breakdown exceeds display precision.");
  // Do not invent an opposing FX gain/loss when its actual value rounds to zero.
  if (roundedFxMinor === 0 && ((stockMinor > 0 && fxMinor < 0) || (stockMinor < 0 && fxMinor > 0))) {
    stockMinor = totalMinor;
    fxMinor = 0;
  }
  return { total: totalMinor / scale, stock: stockMinor / scale, fx: fxMinor === 0 ? 0 : fxMinor / scale };
}
