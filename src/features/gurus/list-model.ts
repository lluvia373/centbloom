import type { GuruFiling } from "./model";

export type GuruSort = "size" | "popular";
// Editorial discovery order, not measured popularity or investment performance.
// Value, macro, growth, activist and contrarian approaches are represented.
export const FEATURED_GURUS = [
  "berkshire-hathaway", "bridgewater", "ark-invest", "pershing-square",
  "scion-asset-management", "himalaya-capital", "daily-journal", "soros-fund",
  "duquesne-family-office", "appaloosa", "oaktree", "gotham-asset-management",
] as const;
const featuredOrder = new Map<string, number>(FEATURED_GURUS.map((slug, index) => [slug, index]));
export interface GuruSummary {
  slug: string;
  name: string;
  manager: string;
  aliases: string[];
  period: string;
  valueUsd: number;
  holdingsCount: number;
  topHoldings: { name: string; valueUsd: number }[];
  limitedScope: boolean;
  pendingCorrection: boolean;
}

export function summarizeGuru(guru: { slug: string; name: string; manager: string; aliases?: string[]; sourceState?: { pendingPeriods?: string[] } }, filing: GuruFiling): GuruSummary {
  // An issuer can represent many ETFs, share classes and options. Only split
  // manager rows for the same security belong in one preview position.
  const securities = new Map<string, { name: string; fullName: string; cusip: string; valueUsd: number }>();
  for (const holding of filing.holdings) {
    const key = [holding.cusip, holding.shareClass, holding.shareType, holding.option ?? ""].join(":");
    const existing = securities.get(key);
    if (existing) { existing.valueUsd += holding.valueUsd; continue; }
    const shareClass = holding.shareClass === "COM" ? "" : holding.shareClass.replace(/^CAP STK (CL [A-Z])$/, "$1");
    const suffix = [holding.shareType === "PRN" ? "원금" : "", holding.option ?? ""].filter(Boolean);
    securities.set(key, {
      name: [holding.issuer, shareClass, ...suffix].filter(Boolean).join(" · "),
      fullName: [holding.issuer, holding.shareClass, ...suffix].join(" · "),
      cusip: holding.cusip, valueUsd: holding.valueUsd,
    });
  }
  const names = new Map<string, number>();
  for (const security of securities.values()) names.set(security.name, (names.get(security.name) ?? 0) + 1);
  const topHoldings = [...securities.values()].map(security => ({
    name: names.get(security.name)! > 1 ? `${security.fullName} · ${security.cusip}` : security.name,
    valueUsd: security.valueUsd,
  })).sort((a, b) => b.valueUsd - a.valueUsd || a.name.localeCompare(b.name)).slice(0, 3);
  return {
    slug: guru.slug, name: guru.name, manager: guru.manager, aliases: guru.aliases ?? [],
    period: filing.period, valueUsd: filing.expectedValueUsd, holdingsCount: securities.size,
    topHoldings,
    limitedScope: !!filing.disclosureScope?.confidentialOmitted || filing.disclosureScope?.reportType === "combination",
    pendingCorrection: !!guru.sourceState?.pendingPeriods?.includes(filing.period),
  };
}

const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, "");
export function selectGurus(gurus: readonly GuruSummary[], query: string, sort: GuruSort) {
  const search = normalize(query.trim());
  return gurus.filter(guru => !search || normalize([guru.name, guru.manager, ...guru.aliases].join(" ")).includes(search))
    .sort((a, b) => {
      const rank = sort === "popular" ? (featuredOrder.get(a.slug) ?? FEATURED_GURUS.length) - (featuredOrder.get(b.slug) ?? FEATURED_GURUS.length) : 0;
      return rank || b.valueUsd - a.valueUsd || a.name.localeCompare(b.name, "en") || a.slug.localeCompare(b.slug);
    });
}

export function compactUsd(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}조`;
  if (value >= 1e8) return `$${(value / 1e8).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억`;
  if (value >= 1e4) return `$${(value / 1e4).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}만`;
  return `$${value.toLocaleString("ko-KR")}`;
}

export const quarterLabel = (period: string) => `${period.slice(0, 4)}년 ${Math.ceil(Number(period.slice(5, 7)) / 3)}분기`;
