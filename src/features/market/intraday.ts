export type IntradayRange = "1d" | "5d";
export type IntradayInterval = "1m" | "30m";

/** at is the valuation instant, never the start of an unfinished price bar. */
export interface IntradayPoint {
  at: string;
  close: number | null;
  sourceAt: string | null;
  reason?: string;
}

export interface IntradaySeries {
  symbol: string;
  currency: string;
  interval: IntradayInterval;
  startAt: string;
  endAt: string;
  fetchedAt: string;
  points: IntradayPoint[];
}
