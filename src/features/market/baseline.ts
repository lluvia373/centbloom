/** Public market data only. Position quantities and account data never enter this response. */
export interface MidnightBaseline {
  symbol: string;
  /** Calendar date in Asia/Seoul. */
  date: string;
  baselineAt: string;
  currency: string | null;
  price: number | null;
  status: "available" | "unavailable";
  /** A minute bar is not an exact second-level trade at midnight. */
  precision: "minute" | "session-close" | null;
  source: "yahoo-chart";
  /** Provider's candle timestamp, not the retrieval time. */
  sourceAt: string | null;
  /** Minute end, or published regular-session end for a daily closing bar. */
  sourceEndAt: string | null;
  /** Midnight minus sourceEndAt. A completed market session can legitimately be older. */
  cutoffLagSeconds: number | null;
  marketClosed: boolean | null;
  fetchedAt: string;
  reason?:
    | "missing-price"
    | "stale-price"
    | "unsupported-resolution"
    | "unknown-session"
    | "missing-currency";
}
