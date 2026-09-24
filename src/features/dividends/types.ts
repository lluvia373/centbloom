import type { DividendAnnouncement } from "@/features/portfolio/model/dividends";

/** Public source facts only; never contains an account or its transactions. */
export interface PreparedDividendEvent extends DividendAnnouncement {
  name: string;
  declaredDate: string;
  recordDate: string;
  shareHistoryFrom: string;
  issuerCountry: "KR" | "US" | "unknown";
  instrument: "ordinary-share" | "adr" | "other";
  treatyEligible: boolean;
  rightsSourceUrl: string;
  factsCheckedUrl: string;
  rightsCheckedAt: string;
}

export interface DividendCoverage {
  symbol: string;
  status: "supported" | "partial" | "no-announcement" | "unsupported" | "failed";
  from: string;
  through: string;
  checkedAt: string | null;
  sourceUrl?: string;
  reason?: string;
}

export interface DividendFeed {
  version: 1;
  checkedAt: string;
  sourceCheckedAt: string | null;
  events: PreparedDividendEvent[];
  symbols: DividendCoverage[];
}
